// The route guard (KTD6, U3 plan step 5). Every route names who may call it where it is defined,
// as its first handler:
//
//   router.post("/staff", allow("owner"), addStaff)
//
// A route without that declaration stops createApp with an error, so a forgotten one can never
// answer a request. Hiding a button in the React app is not access control; this is.
import type { ACCOUNT_ROLES } from "@jeyos/domain";
import type { Express, RequestHandler, Router } from "express";

import { HttpError } from "../http/errors.ts";
import { pairedDeviceOf } from "./devices.ts";
import { signedInAs } from "./sign-in.ts";

/**
 * Who may call a route: an account role, "door" for a paired door tablet (only scan routes say
 * this, R42), or "anyone", which also lets signed-out requests in.
 */
export type Access = (typeof ACCOUNT_ROLES)[number] | "door" | "anyone";

// Each guard allow() made, and whom it lets in, so listRoutes can read every route's declaration
const declarations = new WeakMap<RequestHandler, readonly Access[]>();

/** The guard to put first on a route. Takes at least one Access, so "nobody" can't be written by mistake. */
export function allow(...access: [Access, ...Access[]]): RequestHandler {
  const guard: RequestHandler = (request, _response, next) => {
    const signedIn = signedInAs(request);
    const device = pairedDeviceOf(request);
    const letIn =
      access.includes("anyone") ||
      (signedIn !== null && access.includes(signedIn.role)) ||
      (device !== null && access.includes("door"));
    if (!letIn) {
      // 401 tells the screen to sign in, or the tablet to pair; 403 tells it this account or
      // tablet may not do this
      if (signedIn === null && device === null) {
        throw new HttpError(401, "signed_out");
      }
      throw new HttpError(403, "not_allowed");
    }
    next();
  };
  declarations.set(guard, access);
  return guard;
}

/** One method on one path, with whom its allow() lets in, or null when it has none. */
export interface FoundRoute {
  method: string;
  path: string;
  access: readonly Access[] | null;
}

// The parts of Express's router we read. Express keeps each app.get or router.post as a layer
// with a route, and each router.use("/auth", otherRouter) as a layer whose handle has its own stack
interface Layer {
  route?: { path: string; stack: { method?: string; handle: unknown }[] };
  handle: unknown;
  rawPath?: unknown;
}

// "/api" + "/setup" + "/" is "/api/setup", not "/api/setup/"
function joinPath(prefix: string, path: string): string {
  return (prefix + path).replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
}

function walk(stack: Layer[], prefix: string, found: FoundRoute[]): void {
  for (const layer of stack) {
    if (layer.route !== undefined) {
      const path = joinPath(prefix, layer.route.path);
      // A route can serve several methods, like .get(...).post(...). Each method's first handler
      // is the one that runs first, so that one must be the guard
      const firstHandler = new Map<string, unknown>();
      for (const { method = "all", handle } of layer.route.stack) {
        if (!firstHandler.has(method)) {
          firstHandler.set(method, handle);
        }
      }
      for (const [method, handle] of firstHandler) {
        const access = declarations.get(handle as RequestHandler) ?? null;
        found.push({ method: method.toUpperCase(), path, access });
      }
    } else if (typeof layer.handle === "function" && "stack" in layer.handle) {
      // A router mounted with use(): its routes sit under this layer's path
      walk(layer.handle.stack as Layer[], joinPath(prefix, String(layer.rawPath)), found);
    }
  }
}

/** Every route in the app or router, with its full path, for the startup check and the permission matrix test. */
export function listRoutes(app: Express | Router): FoundRoute[] {
  const found: FoundRoute[] = [];
  walk(("router" in app ? app.router : app).stack, "", found);
  return found;
}

/** Called by createApp before it returns: refuses to build an app with any undeclared route. */
export function requireEveryRouteDeclared(app: Express): void {
  const undeclared = listRoutes(app).filter((route) => route.access === null);
  if (undeclared.length > 0) {
    const names = undeclared.map((route) => `${route.method} ${route.path}`).join(", ");
    throw new Error(`These routes have no allow(...) as their first handler: ${names}`);
  }
}
