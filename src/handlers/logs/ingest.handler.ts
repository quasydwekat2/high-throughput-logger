import type { Request, Response } from 'express';
import { config } from '../../config.js';
import { validateLogBatch } from '../../utils/batch-validation.util.js';
import { insertLogs } from '../../repositories/logs/ingest.repository.js';
import { ingestBuffer } from '../../services/ingest-buffer.js';
import {
  IngestRejectedError,
  ValidationError,
} from '../../types/app-error.js';
import type {
  IngestLogsRequest,
  IngestLogsResponse,
} from '../../types/log.types.js';

export async function ingestHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as IngestLogsRequest | null;

  if (!body || !Array.isArray(body.logs)) {
    throw new ValidationError('Request body must be { "logs": [...] }');
  }

  const { accepted, rejected } = validateLogBatch(body.logs);

  if (accepted.length === 0) {
    const response: IngestLogsResponse = { accepted: 0, rejected };
    throw new IngestRejectedError(response);
  }

  if (config.ingestBufferEnabled) {
    ingestBuffer.enqueue(accepted);
  } else {
    await insertLogs(accepted);
  }

  const response: IngestLogsResponse = {
    accepted: accepted.length,
    rejected,
  };
  res.status(200).json(response);
}
