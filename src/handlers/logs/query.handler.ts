import type { Request, Response } from 'express';
import { parseQueryParams } from '../../utils/query-validation.util.js';
import { queryLogs } from '../../repositories/logs/query.repository.js';
import type {
  QueryLogsParams,
  QueryLogsResponse,
} from '../../types/log.types.js';

export async function queryHandler(req: Request, res: Response): Promise<void> {
  const qs = req.query as QueryLogsParams;
  const params = parseQueryParams(qs);
  const response: QueryLogsResponse = await queryLogs(params);
  res.status(200).json(response);
}
