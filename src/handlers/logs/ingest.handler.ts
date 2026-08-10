import type { Request, Response } from 'express';
import { validateLogBatch } from '../../utils/batch-validation.util.js';
import { insertLogs } from '../../repositories/logs/ingest.repository.js';
import type { IngestLogsRequest, IngestLogsResponse } from '../../types/log.types.js';

export async function ingestHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as IngestLogsRequest | null;

  if (!body || !Array.isArray(body.logs)) {
    res.status(400).json({ error: 'Request body must be { "logs": [...] }' });
    return;
  }

  const { accepted, rejected } = validateLogBatch(body.logs);

  if (accepted.length === 0) {
    const response: IngestLogsResponse = { accepted: 0, rejected };
    res.status(400).json(response);
    return;
  }

  await insertLogs(accepted);

  const response: IngestLogsResponse = { accepted: accepted.length, rejected };
  res.status(200).json(response);
}
