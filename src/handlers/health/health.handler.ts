import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../../DB/client.js';

export async function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await pool.query('SELECT 1');
    return reply.code(200).send({ status: 'ok' });
  } catch {
    return reply.code(503).send({ status: 'unavailable' });
  }
}
