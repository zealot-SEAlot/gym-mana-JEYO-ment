// The Express app: the JSON API under /api, and the built client pages for everything else (U2).
import { join, resolve } from "node:path";

import express from "express";
import type { Express } from "express";

import { requireCsrfToken } from "./auth/csrf.ts";
import { allow, requireEveryRouteDeclared } from "./auth/guard.ts";
import { setupRouter } from "./auth/setup.ts";
import { loadSession, signInRouter } from "./auth/sign-in.ts";
import { staffRouter } from "./auth/staff.ts";
import type { GymDatabase } from "./db/client.ts";
import { errorHandler, HttpError } from "./http/errors.ts";
import { noStore, securityHeaders } from "./http/security-headers.ts";

/**
 * Builds the app. clientDir is the folder Vite builds the client into (packages/client/dist), and
 * setupSecretFile is the install script's secret for owner setup.
 */
export function createApp({
  clientDir,
  setupSecretFile,
  db,
}: {
  clientDir: string;
  setupSecretFile: string;
  db: GymDatabase;
}): Express {
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
  // Finds the signed-in account, if any, before any router runs
  api.use(loadSession(db));
  // Every write from a signed-in browser must carry its CSRF token
  api.use(requireCsrfToken);
  api.use("/auth", signInRouter(db));
  api.use("/setup", setupRouter(db, setupSecretFile));
  api.use("/staff", staffRouter(db));
  api.use(() => {
    throw new HttpError(404, "not_found");
  });
  app.use("/api", api);

  // Files the client build made (scripts, styles, icons)
  app.use(express.static(clientDir));

  // The client switches screens itself, so a reload on /members/42 must still get the client page
  // Anyone: the page itself holds no gym data, and every /api route it calls has its own guard
  app.get("/{*path}", allow("anyone"), (_request, response) => {
    response.sendFile(indexFile);
  });

  app.use(errorHandler);

  // A route with no allow(...) stops the server here, before it can answer anything (KTD6)
  requireEveryRouteDeclared(app);
  return app;
}
