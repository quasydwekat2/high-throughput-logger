import type { RequestHandler } from "express";
import { NotFoundError } from "../types/app-error.js";

/** Unknown routes → NotFoundError (handled by errorMiddleware). */
export const notFoundMiddleware: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
