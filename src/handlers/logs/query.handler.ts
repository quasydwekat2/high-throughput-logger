import type { FastifyRequest, FastifyReply } from 'fastify';

export async function queryHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // TODO: parse query params, build parameterized SQL, return cursor-paginated results
  return reply.code(200).send({ logs: [], next_cursor: null });
}
