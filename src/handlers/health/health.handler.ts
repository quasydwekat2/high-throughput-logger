import type { Request, Response } from "express";
import { pool } from "../../DB/client.js";
import { ServiceUnavailableError } from "../../types/error.middleware/index.js";
import type { HealthStatusResponse } from "../../types/http/health.types.js";

/**
 * Must match how many migrations node-pg-migrate has applied
 * (rows in `pgmigrations` = files under src/DB/migrations).
 * Bump when you add a migration.
 */
const EXPECTED_MIGRATION_COUNT = 3;

export async function healthHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM pgmigrations",
    );
    const applied = result.rows[0]?.count ?? 0;

    if (applied < EXPECTED_MIGRATION_COUNT) {
      throw new ServiceUnavailableError();
    }

    const body: HealthStatusResponse = { status: "ok" };
    res.status(200).json(body);
  } catch (err) {
    // Health contract: any DB/readiness failure → 503 { status: unavailable }
    if (err instanceof ServiceUnavailableError) throw err;
    throw new ServiceUnavailableError();
  }
}
