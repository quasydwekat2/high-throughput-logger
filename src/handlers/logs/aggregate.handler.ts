import type { Request, Response } from 'express';
import { parseAggregateParams } from '../../utils/query-params.util.js';
import { aggregateLogs } from '../../repositories/logs/aggregate.repository.js';
import type { AggregateLogsResponse } from '../../types/log.types.js';

export async function aggregateHandler(req: Request, res: Response): Promise<void> {
  const qs = req.query as Record<string, string | string[] | undefined>;

  const result = parseAggregateParams(qs);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const buckets = await aggregateLogs(result.params);
  const response: AggregateLogsResponse = { buckets };

  res.status(200).json(response);
}
