import type { Request, Response } from 'express';
import { pool } from '../../DB/client.js';

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
}
