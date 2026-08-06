import type { FastifyRequest, FastifyReply } from 'fastify';

export async function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  return reply.code(200).send({ status: 'ok' });
}
