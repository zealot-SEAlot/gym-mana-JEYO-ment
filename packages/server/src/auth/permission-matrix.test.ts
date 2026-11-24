// The permission matrix (KTD6, U3 plan step 5). It finds every route in the real app, checks
// that each one declares exactly the access written in EXPECTED below, and then calls every route
// as every kind of requester to prove the guard lets in exactly those and no one else.
// A new route fails this test until someone adds it to EXPECTED, so every access decision is
// written down here, where a reviewer sees it.
// U18 adds members as a requester.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { devices } from "@jeyos/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { openTestDatabase } from "../db/test-database.ts";
import type { Access } from "./guard.ts";
import { listRoutes } from "./guard.ts";
import { hashToken, randomToken, startSession } from "./sessions.ts";

// Who may call each route. Change a line here only on purpose, and say why in the pull request
const EXPECTED: Record<string, Access[]> = {
  "POST /api/auth/sign-in": ["anyone"],
  "POST /api/auth/sign-out": ["anyone"],
  "GET /api/auth/session": ["anyone"],
  "POST /api/setup": ["anyone"],
  "POST /api/setup/recover": ["anyone"],
  // Managing accounts is the owner's alone (R4)
  "GET /api/staff": ["owner"],
  "POST /api/staff": ["owner"],
  "PATCH /api/staff/:id": ["owner"],
  "POST /api/staff/:id/password": ["owner"],
  // Pairing and revoking door tablets is the owner's alone (R51)
  "POST /api/devices/pairing-code": ["owner"],
  "GET /api/devices": ["owner"],
  "DELETE /api/devices/:id": ["owner"],
  // The tablet has no login yet when it pairs; the code is the proof
  "POST /api/devices/pair": ["anyone"],
  // The tablet's own check that it is still paired
  "GET /api/devices/this": ["door"],
  // Member details are for the desk: never the door tablet (R42, R54) or a signed-out request
  "POST /api/members": ["owner", "staff"],
  "GET /api/members/:id": ["owner", "staff"],
  "GET /api/members/:id/qr.svg": ["owner", "staff"],
  // Faces too: the door gets a photo only inside its own scan answer (U5)
  "POST /api/members/:id/photo": ["owner", "staff"],
  "GET /api/members/:id/photo": ["owner", "staff"],
  // Making a member active without a payment is the owner's alone (R4, R44)
  "POST /api/members/:id/carried-over-expiry": ["owner"],
  "GET /{*path}": ["anyone"],
};

// The test database already has the owner as account 1 (test-database.ts); this adds staff as 2
const ACCOUNT_IDS = { owner: 1, staff: 2 } as const;
type Requester = keyof typeof ACCOUNT_IDS | "door" | "signedOut";
const REQUESTERS: Requester[] = ["owner", "staff", "door", "signedOut"];

// The answers only the guard gives. Any other answer, even an error, means the guard let it through
const GUARD_REFUSALS = new Set(["signed_out", "not_allowed"]);

// Built when the file loads, so it.each below can list the routes as separate tests
const folder = mkdtempSync(join(tmpdir(), "jeyos-matrix-test-"));
writeFileSync(join(folder, "index.html"), "<title>client page</title>");
const { sqlite, db, localOnlyDb } = openTestDatabase();
sqlite.exec(
  "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (2, 'Lee', 'lee', 'staff', 'hash', 'argon2id')",
);
const app = createApp({
  clientDir: folder,
  setupSecretFile: join(folder, "setup-secret.txt"),
  db,
  localOnlyDb,
  photosDir: join(folder, "photos"),
});
const routes = listRoutes(app);

// Every route, called by every requester
const cells = routes.flatMap((route) =>
  REQUESTERS.map((requester) => {
    const allowed = route.access!.includes("anyone") || route.access!.includes(requester as Access);
    return { ...route, requester, allowed, verdict: allowed ? "allowed" : "refused" };
  }),
);

describe("permission matrix", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it("finds exactly the routes in EXPECTED, each with its expected access", () => {
    const found = Object.fromEntries(
      routes.map((route) => [`${route.method} ${route.path}`, route.access]),
    );

    expect(found).toEqual(EXPECTED);
  });

  it.each(cells)(
    "$requester: $method $path is $verdict",
    async ({ method, path, requester, allowed }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // A new session or tablet for each call, so a call to sign-out or revoke can't sign out the
      // calls after it. The CSRF token is sent too, so the CSRF check can't refuse what the guard
      // would allow
      if (requester === "door") {
        const token = randomToken();
        const csrfToken = randomToken();
        db.insert(devices)
          .values({ tokenHash: hashToken(token), csrfToken, pairedAt: new Date().toISOString() })
          .run();
        headers.Cookie = `__Host-jeyos-device=${token}`;
        headers["X-CSRF-Token"] = csrfToken;
      } else if (requester !== "signedOut") {
        const { token, csrfToken } = startSession(db, ACCOUNT_IDS[requester], new Date());
        headers.Cookie = `__Host-jeyos-session=${token}`;
        headers["X-CSRF-Token"] = csrfToken;
      }
      // Route parameters get a made-up value: the guard runs before anything looks them up
      const url = baseUrl + path.replace(/:\w+/g, "1").replace("{*path}", "any/screen");

      const response = await fetch(url, {
        method,
        headers,
        body: method === "GET" ? undefined : "{}",
      });
      // The client page answers with HTML, every /api route with JSON
      const text = await response.text();
      const body = (text.startsWith("{") ? JSON.parse(text) : {}) as { error?: string };

      expect(GUARD_REFUSALS.has(body.error ?? "")).toBe(!allowed);
    },
  );
});
