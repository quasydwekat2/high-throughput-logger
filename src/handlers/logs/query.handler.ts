import type { Request, Response } from 'express';
import { parseQueryParams } from '../../utils/query-params.util.js';
import { queryLogs } from '../../repositories/logs/query.repository.js';
import type { QueryLogsResponse } from '../../types/log.types.js';

export async function queryHandler(req: Request, res: Response): Promise<void> {
  const qs = req.query as Record<string, string | string[] | undefined>;

  const result = parseQueryParams(qs);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  const response: QueryLogsResponse = await queryLogs(result.params);

  res.status(200).json(response);
}
