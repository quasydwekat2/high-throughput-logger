import type { FastifyRequest, FastifyReply } from 'fastify';
import { parseQueryParams } from '../../utils/query-params.util.js';
import { queryLogs } from '../../repositories/logs/query.repository.js';
import type { QueryLogsResponse } from '../../types/log.types.js';

export async function queryHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const qs = req.query as Record<string, string | string[] | undefined>;

  const result = parseQueryParams(qs);
  if ('error' in result) {
    return reply.code(400).send({ error: result.error });
  }

  const response: QueryLogsResponse = await queryLogs(result.params);

  return reply.code(200).send(response);
}
