import { AppError } from "./app.error.js";

/** Unknown route or resource → 404 */
export class NotFoundError extends AppError {
  constructor(message = "not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}
