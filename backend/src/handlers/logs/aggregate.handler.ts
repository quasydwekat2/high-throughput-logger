import type { Request, Response } from "express";
import { parseAggregateParams } from "../../utils/query-validation.util.js";
import { aggregateLogs } from "../../repositories/logs/aggregate.repository.js";
import type {
  AggregateLogsParams,
  AggregateLogsResponse,
} from "../../types/log.types.js";

export async function aggregateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const qs = req.query as AggregateLogsParams;
  const params = parseAggregateParams(qs);
  const buckets = await aggregateLogs(params);
  const response: AggregateLogsResponse = { buckets };
  res.status(200).json(response);
}
