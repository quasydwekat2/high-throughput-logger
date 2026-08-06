import type { FastifyRequest, FastifyReply } from 'fastify';

export async function aggregateHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: parse query params, run date_trunc aggregation SQL, return time buckets
  return reply.code(200).send({ buckets: [] });
}
