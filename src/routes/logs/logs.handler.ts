import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateLogBatch } from '../../utils/batch-validation.util.js';

// ─── Ingest ───────────────────────────────────────────────────────────────────

export async function ingestHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = req.body as Record<string, unknown> | null;

  if (!body || !Array.isArray(body.logs)) {
    return reply
      .code(400)
      .send({ error: 'Request body must be { "logs": [...] }' });
  }

  const { accepted, rejected } = validateLogBatch(body.logs as any[]);

  if (accepted.length === 0) {
    return reply.code(400).send({ accepted: 0, rejected });
  }

  // TODO: write `accepted` to DB (batch insert)

  return reply.code(200).send({ accepted: accepted.length, rejected });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function queryHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: parse query params, build SQL, return paginated results
  return reply.code(200).send({ logs: [], next_cursor: null });
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export async function aggregateHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: parse query params, run date_trunc SQL, return buckets
  return reply.code(200).send({ buckets: [] });
}
