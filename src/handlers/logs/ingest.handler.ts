import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateLogBatch } from '../../utils/batch-validation.util.js';
import { insertLogs } from '../../repositories/logs/ingest.repository.js';
import type { IngestLogsRequest, IngestLogsResponse } from '../../types/log.types.js';

export async function ingestHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = req.body as IngestLogsRequest | null;

  if (!body || !Array.isArray(body.logs)) {
    return reply.code(400).send({ error: 'Request body must be { "logs": [...] }' });
  }

  const { accepted, rejected } = validateLogBatch(body.logs);

  if (accepted.length === 0) {
    const response: IngestLogsResponse = { accepted: 0, rejected };
    return reply.code(400).send(response);
  }

  await insertLogs(accepted);

  const response: IngestLogsResponse = { accepted: accepted.length, rejected };
  return reply.code(200).send(response);
}
