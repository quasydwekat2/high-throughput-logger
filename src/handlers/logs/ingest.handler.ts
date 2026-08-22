import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import { config } from '../../config.js';
import { validateLogBatch } from '../../utils/batch-validation.util.js';
import { insertLogs } from '../../repositories/logs/ingest.repository.js';
import { ingestBuffer } from '../../services/ingest-buffer.js';
import {
  AppError,
  IngestRejectedError,
  ValidationError,
} from '../../types/app-error.js';
import type {
  IngestLogsRequest,
  IngestLogsResponse,
} from '../../types/log.types.js';

const BODY_LIMIT = 2 * 1024 * 1024;

export async function ingestLogBatch(
  body: unknown,
): Promise<IngestLogsResponse> {
  if (!body || typeof body !== 'object' || !Array.isArray((body as IngestLogsRequest).logs)) {
    throw new ValidationError('Request body must be { "logs": [...] }');
  }

  const { accepted, rejected } = validateLogBatch((body as IngestLogsRequest).logs);

  if (accepted.length === 0) {
    throw new IngestRejectedError({ accepted: 0, rejected });
  }

  if (config.ingestBufferEnabled) {
    // Wait until this batch is flushed to Postgres — never 200 before durable write.
    await ingestBuffer.enqueue(accepted);
  } else {
    await insertLogs(accepted);
  }

  return { accepted: accepted.length, rejected };
}

export async function ingestHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const response = await ingestLogBatch(req.body);
  res.status(200).json(response);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function mapIngestError(err: unknown): { status: number; body: unknown } {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: err.responseBody ?? { error: err.message },
    };
  }
  if (err instanceof SyntaxError) {
    return { status: 400, body: { error: 'malformed JSON body' } };
  }
  console.error('ingest error:', err);
  return { status: 500, body: { error: 'internal server error' } };
}

async function readBody(
  req: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) {
      req.destroy();
      const err = new AppError(413, 'request body too large');
      throw err;
    }
    chunks.push(buf);
  }
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size);
}

/** Fast path used by the native HTTP server — skips Express JSON middleware. */
export async function handleIngestHttp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const raw = await readBody(req, BODY_LIMIT);
    if (raw.length === 0) {
      throw new ValidationError('Request body must be { "logs": [...] }');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new SyntaxError('malformed JSON body');
    }
    const response = await ingestLogBatch(parsed);
    sendJson(res, 200, response);
  } catch (err) {
    if (res.headersSent) return;
    const mapped = mapIngestError(err);
    sendJson(res, mapped.status, mapped.body);
  }
}

export function isIngestUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  return path === '/logs';
}
