// The Express app: the JSON API under /api, and the built client pages for everything else (U2).
import { join, resolve } from "node:path";

import express from "express";
import type { Express } from "express";

import { errorHandler, HttpError } from "./http/errors.ts";
import { noStore, securityHeaders } from "./http/security-headers.ts";

/** Builds the app. clientDir is the folder Vite builds the client into (packages/client/dist). */
export function createApp(clientDir: string): Express {
  const app = express();
  const indexFile = join(resolve(clientDir), "index.html");

  // Express names itself in an X-Powered-By header by default, which only helps an attacker
  app.disable("x-powered-by");
  app.use(securityHeaders);

  // Later units mount their routers here. Any /api path no router answered is a JSON not-found,
  // so the desk screens never get the client page back when they expected data
  const api = express.Router();
  api.use(noStore);
  // Reads JSON request bodies up to 100 KB; a broken or larger body becomes a 4xx error
  api.use(express.json());
  api.use(() => {
    throw new HttpError(404, "not_found");
  });
  app.use("/api", api);

  // Files the client build made (scripts, styles, icons)
  app.use(express.static(clientDir));

  // The client switches screens itself, so a reload on /members/42 must still get the client page
  app.get("/{*path}", (_request, response) => {
    response.sendFile(indexFile);
  });

  app.use(errorHandler);

  return app;
}
