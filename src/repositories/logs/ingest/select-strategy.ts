import type {
  IngestStrategyName,
  InsertLogsStrategy,
} from '../../../types/logs/index.js';
import { insertWithCopy } from './strategies/copy.strategy.js';
import { insertWithUnnest } from './strategies/unnest.strategy.js';
import { insertRowByRow } from './strategies/row-by-row.strategy.js';

/**
 * Change this one line to switch the ingest strategy:
 *   'copy'       — COPY FROM STDIN (default, fastest)
 *   'unnest'     — INSERT … unnest()
 *   'row-by-row' — one INSERT per row
 */
export const ACTIVE_INGEST_STRATEGY: IngestStrategyName = 'copy';

const strategies: Record<IngestStrategyName, InsertLogsStrategy> = {
  copy: insertWithCopy,
  unnest: insertWithUnnest,
  'row-by-row': insertRowByRow,
};

export function getIngestStrategy(): InsertLogsStrategy {
  return strategies[ACTIVE_INGEST_STRATEGY];
}
