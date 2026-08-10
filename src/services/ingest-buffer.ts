import { config } from '../config.js';
import { insertLogs } from '../repositories/logs/ingest.repository.js';
import { AppError } from '../types/error.middleware/index.js';
import type { LogEntry } from '../types/logs/index.js';

/**
 * In-memory ingest buffer: enqueue validated logs, flush in bulk by size or timer.
 * Trades durability for higher throughput under many small concurrent POSTs.
 */
class IngestBuffer {
  private queue: LogEntry[] = [];
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

  /** Enqueue validated logs; returns immediately (write happens on flush). */
  enqueue(logs: LogEntry[]): void {
    if (logs.length === 0) return;

    if (this.closed) {
      throw new AppError(503, 'ingest buffer is shutting down');
    }

    if (this.queue.length + logs.length > config.queueMaxSize) {
      throw new AppError(503, 'ingest buffer full');
    }

    this.queue.push(...logs);

    if (this.queue.length >= config.flushBatchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;

    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, config.flushBatchSize);
        try {
          await insertLogs(batch);
        } catch (err) {
          // Put failed batch back so a later flush can retry.
          this.queue.unshift(...batch);
          console.error('ingest buffer flush failed:', err);
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
