import { config } from '../config.js';
import { insertLogs } from '../repositories/logs/ingest.repository.js';
import { AppError } from '../types/app-error.js';
import type { LogEntry } from '../types/log.types.js';

/**
 * One caller waiting for its logs to be durably written.
 * Several waiters are coalesced into a single Postgres flush for throughput.
 */
interface PendingWrite {
  logs: LogEntry[];
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * In-memory ingest buffer: coalesce concurrent POSTs into bulk flushes.
 * `enqueue` resolves only after those logs are written to Postgres —
 * never return 200 before durable acceptance.
 *
 * At most `flushConcurrency` COPY operations run in parallel so a 1-CPU
 * Postgres still has headroom for query/aggregate on the read pool.
 */
class IngestBuffer {
  private pending: PendingWrite[] = [];
  private queuedCount = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private activeFlushes = 0;
  private closed = false;

  start(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, config.flushIntervalMs);

    // Don't keep the process alive just for the flush timer.
    this.flushTimer.unref?.();
  }

  /**
   * Enqueue validated logs and wait until they are flushed to Postgres.
   * Concurrent callers share bulk inserts up to flushConcurrency.
   */
  enqueue(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return Promise.resolve();

    if (this.closed) {
      return Promise.reject(new AppError(503, 'ingest buffer is shutting down'));
    }

    if (this.queuedCount + logs.length > config.queueMaxSize) {
      return Promise.reject(new AppError(503, 'ingest buffer full'));
    }

    return new Promise<void>((resolve, reject) => {
      this.pending.push({ logs, resolve, reject });
      this.queuedCount += logs.length;

      if (this.queuedCount >= config.flushBatchSize) {
        void this.flush();
      }
    });
  }

  async flush(): Promise<void> {
    const max = Math.max(1, config.flushConcurrency);

    while (this.pending.length > 0 && this.activeFlushes < max) {
      const { batch } = this.takeBatch();
      if (batch.length === 0) break;

      this.activeFlushes += 1;
      void this.writeBatch(batch).finally(() => {
        this.activeFlushes -= 1;
        if (this.pending.length > 0) {
          void this.flush();
        }
      });
    }
  }

  private async writeBatch(batch: PendingWrite[]): Promise<void> {
    const allLogs = batch.flatMap((w) => w.logs);
    try {
      await insertLogs(allLogs);
      for (const w of batch) w.resolve();
    } catch (err) {
      console.error('ingest buffer flush failed:', err);
      for (const w of batch) w.reject(err);
    }
  }

  /**
   * Take waiters from the front until flushBatchSize logs (or all pending).
   * Never splits a single waiter's logs across flushes.
   */
  private takeBatch(): { batch: PendingWrite[]; count: number } {
    const batch: PendingWrite[] = [];
    let count = 0;

    while (this.pending.length > 0) {
      const next = this.pending[0];
      if (batch.length > 0 && count + next.logs.length > config.flushBatchSize) {
        break;
      }
      this.pending.shift();
      batch.push(next);
      count += next.logs.length;
    }

    this.queuedCount -= count;
    return { batch, count };
  }

  /** Stop accepting new logs and drain the queue (for graceful shutdown). */
  async stop(): Promise<void> {
    this.closed = true;

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    while (this.activeFlushes > 0 || this.pending.length > 0) {
      void this.flush();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Anything still pending after a failed flush: reject so callers don't hang.
    if (this.pending.length > 0) {
      const err = new AppError(503, 'ingest buffer shut down before flush');
      for (const w of this.pending) w.reject(err);
      this.pending = [];
      this.queuedCount = 0;
    }
  }

  get size(): number {
    return this.queuedCount;
  }
}

export const ingestBuffer = new IngestBuffer();
