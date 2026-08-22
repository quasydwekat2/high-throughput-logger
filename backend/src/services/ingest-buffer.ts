import { config } from "../config.js";
import {
  encodeCopyBatch,
  insertEncodedCopy,
  mergeCopyPayloads,
} from "../repositories/logs/ingest/strategies/copy.strategy.js";
import { AppError } from "../types/app-error.js";
import type { EncodedCopyPayload, LogEntry } from "../types/log.types.js";

/**
 * One caller waiting for its logs to be durably written.
 * Several waiters are coalesced into a single Postgres flush for throughput.
 */
interface PendingWrite {
  encoded: EncodedCopyPayload;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * In-memory ingest buffer: coalesce concurrent POSTs into bulk flushes.
 * `enqueue` resolves only after those logs are written to Postgres —
 * never return 200 before durable acceptance.
 *
 * COPY text is encoded on enqueue (HTTP batch size) so a flush never
 * blocks the event loop on a multi-thousand-row stringify. Flush batch
 * size is kept modest so p95 cannot floor at one huge COPY.
 */
class IngestBuffer {
  private pending: PendingWrite[] = [];
  private queuedCount = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private immediateScheduled = false;
  private activeFlushes = 0;
  private closed = false;

  start(): void {
    if (this.flushTimer !== null) return;

    this.flushTimer = setInterval(() => {
      void this.flush();
    }, config.flushIntervalMs);

    this.flushTimer.unref?.();
  }

  enqueue(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return Promise.resolve();

    if (this.closed) {
      return Promise.reject(
        new AppError(503, "ingest buffer is shutting down"),
      );
    }

    if (this.queuedCount + logs.length > config.queueMaxSize) {
      return Promise.reject(new AppError(503, "ingest buffer full"));
    }

    const encoded = encodeCopyBatch(logs);

    return new Promise<void>((resolve, reject) => {
      this.pending.push({ encoded, resolve, reject });
      this.queuedCount += encoded.rowCount;
      this.scheduleFlush();
    });
  }

  /**
   * Merge same-tick POSTs into the first COPY instead of flushing the
   * first waiter alone. While a COPY is running, just queue.
   */
  private scheduleFlush(): void {
    if (this.activeFlushes > 0 || this.immediateScheduled) return;
    this.immediateScheduled = true;
    setImmediate(() => {
      this.immediateScheduled = false;
      void this.flush();
    });
  }

  async flush(): Promise<void> {
    const max = Math.max(1, config.flushConcurrency);

    while (this.pending.length > 0 && this.activeFlushes < max) {
      const batch = this.takeBatch();
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
    const encoded = mergeCopyPayloads(batch.map((w) => w.encoded));
    try {
      await insertEncodedCopy(encoded);
      for (const w of batch) w.resolve();
    } catch (err) {
      console.error("ingest buffer flush failed:", err);
      for (const w of batch) w.reject(err);
    }
  }

  /**
   * Take waiters from the front until flushBatchSize logs (or all pending).
   * Never splits a single waiter's logs across flushes.
   */
  private takeBatch(): PendingWrite[] {
    const limit = config.flushBatchSize;
    let count = 0;
    let take = 0;

    while (take < this.pending.length) {
      const nextLen = this.pending[take].encoded.rowCount;
      if (take > 0 && count + nextLen > limit) break;
      count += nextLen;
      take += 1;
    }

    const batch = this.pending.splice(0, take);
    this.queuedCount -= count;
    return batch;
  }

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

    if (this.pending.length > 0) {
      const err = new AppError(503, "ingest buffer shut down before flush");
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
