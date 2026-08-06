import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateLogBatch } from '../../utils/batch-validation.util.js';
import { insertLogs } from '../../repositories/logs/ingest.repository.js';
import type { LogEntry } from '../../types/log.types.js';

export async function ingestHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = req.body as Record<string, unknown> | null;

  if (!body || !Array.isArray(body.logs)) {
    return reply.code(400).send({ error: 'Request body must be { "logs": [...] }' });
  }

  const { accepted, rejected } = validateLogBatch(body.logs as unknown[]);

  if (accepted.length === 0) {
    return reply.code(400).send({ accepted: 0, rejected });
  }

  await insertLogs(accepted as LogEntry[]);

  return reply.code(200).send({ accepted: accepted.length, rejected });
}
