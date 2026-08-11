import { AppError } from "./app.error.js";

/** Malformed input / bad query / bad body shape → 400 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = "ValidationError";
  }
}
