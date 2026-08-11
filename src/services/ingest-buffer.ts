import { config } from '../config.js';
import { insertLogs } from '../repositories/logs/ingest.repository.js';
import { AppError } from '../types/error.middleware/index.js';
import type { LogEntry, QueuedEntry } from '../types/logs/index.js';

/**
 * In-memory ingest buffer: enqueue validated logs, flush in bulk by size or timer.
 *
 * Durability contract: `enqueue()` returns a promise that only resolves once the
 * entries have actually been written (COPY'd) to Postgres and Postgres has
 * acknowledged the write. Callers (the ingest handler) must await it before
 * responding 200, so a process crash before flush never results in a false ack.
 * Batching still buys throughput: many concurrent callers can share one flush.
 */
class IngestBuffer {
  private queue: QueuedEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
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
   * Enqueue validated logs for durable write.
   * Resolves only after these entries are confirmed written to Postgres;
   * rejects if the buffer is shutting down, full, or the write keeps failing.
   */
  enqueue(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return Promise.resolve();

    if (this.closed) {
      throw new AppError(503, 'ingest buffer is shutting down');
    }

    if (this.queue.length + logs.length > config.queueMaxSize) {
      throw new AppError(503, 'ingest buffer full');
    }

    const pending = logs.map(
      (log) =>
        new Promise<void>((resolve, reject) => {
          this.queue.push({ log, attempts: 0, resolve, reject });
        }),
    );

    if (this.queue.length >= config.flushBatchSize) {
      void this.flush();
    }

    return Promise.all(pending).then(() => undefined);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, config.flushBatchSize);
        try {
          await insertLogs(batch.map((entry) => entry.log));
          for (const entry of batch) entry.resolve();
        } catch (err) {
          console.error('ingest buffer flush failed:', err);

          const retryable: QueuedEntry[] = [];
          for (const entry of batch) {
            entry.attempts += 1;
            if (entry.attempts >= config.flushMaxRetries) {
              entry.reject(
                new AppError(503, 'failed to durably persist log batch'),
              );
            } else {
              retryable.push(entry);
            }
          }

          // Put still-retryable entries back for the next flush (timer-driven) and
          // stop this pass — an immediate retry against a failing DB rarely helps.
          this.queue.unshift(...retryable);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Stop accepting new logs and drain the queue (for graceful shutdown). */
  async stop(): Promise<void> {
    this.closed = true;

    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    while (this.flushing) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await this.flush();
  }

  get size(): number {
    return this.queue.length;
  }
}

export const ingestBuffer = new IngestBuffer();
