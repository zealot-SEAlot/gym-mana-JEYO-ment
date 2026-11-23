// One place that turns every API failure into a JSON error the screens can read (U2, plan step 8).
import type { ErrorRequestHandler } from "express";

/** Throw this from a route to answer with a chosen status, such as 404 for a member that doesn't exist. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Mounted last, so Express hands it every error a route throws or passes to next(). */
export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.code, details: error.details });
    return;
  }

  // express.json() marks a broken or oversized body with a 4xx status, such as 400 or 413
  const status: unknown = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    response.status(status).json({ error: "bad_request" });
    return;
  }

  // Anything else is a bug. Log it on the gym PC, but never send its message, which may hold
  // member details or file paths, to the browser
  console.error(error);
  response.status(500).json({ error: "server_error" });
};
