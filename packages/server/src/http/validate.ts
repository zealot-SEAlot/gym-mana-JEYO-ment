// Checks a request body against its schema from @jeyos/shared before the route runs (U2, plan step 8).
import type { RequestHandler } from "express";
import { z } from "zod";

import { HttpError } from "./errors.ts";

/**
 * Lets the route run only when the body matches schema, replacing the body with Zod's cleaned copy.
 * The same schema checks the form in the browser, so the desk and the server agree on what is valid.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      // Names each wrong field, such as { fields: { name: ["Too small..."] } }, so the screen can mark it
      throw new HttpError(400, "invalid_request", {
        fields: z.flattenError(result.error).fieldErrors,
      });
    }
    request.body = result.data;
    next();
  };
}
