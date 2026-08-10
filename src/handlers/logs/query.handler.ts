import type { Request, Response } from 'express';
import { parseQueryParams } from '../../utils/query-params.util.js';
import { queryLogs } from '../../repositories/logs/query.repository.js';
import { ValidationError } from '../../types/app-error.js';
import type {
  QueryLogsParams,
  QueryLogsResponse,
} from '../../types/log.types.js';

export async function queryHandler(req: Request, res: Response): Promise<void> {
  const qs = req.query as QueryLogsParams;

  const result = parseQueryParams(qs);
  if ('error' in result) {
    throw new ValidationError(result.error);
  }

  const response: QueryLogsResponse = await queryLogs(result.params);
  res.status(200).json(response);
}
