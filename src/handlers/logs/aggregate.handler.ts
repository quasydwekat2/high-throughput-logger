import type { FastifyRequest, FastifyReply } from 'fastify';
import { parseAggregateParams } from '../../utils/query-params.util.js';
import { aggregateLogs } from '../../repositories/logs/aggregate.repository.js';
import type { AggregateLogsResponse } from '../../types/log.types.js';

export async function aggregateHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const qs = req.query as Record<string, string | string[] | undefined>;

  const result = parseAggregateParams(qs);
  if ('error' in result) {
    return reply.code(400).send({ error: result.error });
  }

  const buckets = await aggregateLogs(result.params);
  const response: AggregateLogsResponse = { buckets };

  return reply.code(200).send(response);
}
