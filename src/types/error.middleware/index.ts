/** Middleware-handled HTTP errors: AppError (base) + status-specific subclasses. */
export { AppError } from "./app.error.js";
export { ValidationError } from "./validation.error.js";
export { IngestRejectedError } from "./ingest-rejected.error.js";
export { AuthenticationError } from "./authentication.error.js";
export { NotFoundError } from "./not-found.error.js";
export { DatabaseError } from "./database.error.js";
export { ServiceUnavailableError } from "./service-unavailable.error.js";
