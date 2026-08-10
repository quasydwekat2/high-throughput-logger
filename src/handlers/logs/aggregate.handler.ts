import type { Request, Response } from 'express';
import { parseAggregateParams } from '../../utils/query-params.util.js';
import { aggregateLogs } from '../../repositories/logs/aggregate.repository.js';
import { ValidationError } from '../../types/app-error.js';
import type {
  AggregateLogsParams,
  AggregateLogsResponse,
} from '../../types/log.types.js';

export async function aggregateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const qs = req.query as AggregateLogsParams;

  const result = parseAggregateParams(qs);
  if ('error' in result) {
    throw new ValidationError(result.error);
  }

  const buckets = await aggregateLogs(result.params);
  const response: AggregateLogsResponse = { buckets };
  res.status(200).json(response);
}
