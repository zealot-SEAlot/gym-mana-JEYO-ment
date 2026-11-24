import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { devices } from "@jeyos/domain";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { openLocalOnlyDatabase } from "../db/client.ts";
import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { hashToken, randomToken, startSession } from "./sessions.ts";

describe("door tablets", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;
  let server: Server;
  let baseUrl: string;
  // What a paired tablet's browser holds: its cookie, and the CSRF token its page got
  let tablet: { cookie: string; csrfToken: string; deviceId: number };
  // The owner's browser
  let owner: Record<string, string>;

  beforeEach(async () => {
    ({ sqlite, db } = openTestDatabase());
    server = createApp({
      clientDir: "no-client",
      setupSecretFile: "no-secret",
      db,
      localOnlyDb: openLocalOnlyDatabase(":memory:"),
      photosDir: "no-photos",
    }).listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    // A tablet paired straight in the database, for the tests that aren't about pairing itself
    const token = randomToken();
    const csrfToken = randomToken();
    const { id } = db
      .insert(devices)
      .values({ tokenHash: hashToken(token), csrfToken, pairedAt: new Date().toISOString() })
      .returning({ id: devices.id })
      .get();
    tablet = { cookie: `__Host-jeyos-device=${token}`, csrfToken, deviceId: id };
    const session = startSession(db, 1, new Date());
    owner = { Cookie: `__Host-jeyos-session=${session.token}`, "X-CSRF-Token": session.csrfToken };
  });

  afterEach(async () => {
    await new Promise((done) => server.close(done));
    sqlite.close();
  });

  function call(method: string, path: string, headers: Record<string, string>, body: unknown = {}) {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
  }

  it("lets a paired tablet ask who it is, and hands back its CSRF token", async () => {
    const response = await call("GET", "/devices/this", { Cookie: tablet.cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deviceId: tablet.deviceId,
      csrfToken: tablet.csrfToken,
    });
  });

  it("sends the cookie again with a 400-day expiry, so a tablet in use stays paired", async () => {
    const response = await call("GET", "/devices/this", { Cookie: tablet.cookie });

    const setCookie = response.headers.getSetCookie()[0];
    expect(setCookie).toContain(tablet.cookie);
    expect(setCookie).toContain(`Max-Age=${400 * 86_400}`);
    expect(setCookie).toContain("HttpOnly");
  });

  it("refuses a revoked tablet's next request, and tells its browser to drop the cookie", async () => {
    sqlite.prepare("DELETE FROM devices WHERE id = ?").run(tablet.deviceId);

    const response = await call("GET", "/devices/this", { Cookie: tablet.cookie });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "signed_out" });
    expect(response.headers.getSetCookie()[0]).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("refuses a cookie whose token was never paired", async () => {
    const response = await call("GET", "/devices/this", {
      Cookie: `__Host-jeyos-device=${randomToken()}`,
    });

    expect(response.status).toBe(401);
  });

  it("refuses the tablet on a route that isn't for the door, like the staff list (R42)", async () => {
    const response = await call("GET", "/staff", { Cookie: tablet.cookie });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "not_allowed" });
  });

  describe("writes from the tablet", () => {
    it("are refused without the tablet's CSRF token", async () => {
      const response = await call("POST", "/staff", { Cookie: tablet.cookie });

      expect(await response.json()).toMatchObject({ error: "csrf_token_wrong" });
    });

    it("pass the CSRF check with the token, and then meet the route guard", async () => {
      const response = await call("POST", "/staff", {
        Cookie: tablet.cookie,
        "X-CSRF-Token": tablet.csrfToken,
      });

      expect(await response.json()).toMatchObject({ error: "not_allowed" });
    });
  });

  describe("pairing", () => {
    async function newPairingCode() {
      const response = await call("POST", "/devices/pairing-code", owner);
      return ((await response.json()) as { pairingCode: string }).pairingCode;
    }

    function pair(pairingCode: string, headers: Record<string, string> = {}) {
      return call("POST", "/devices/pair", headers, { pairingCode });
    }

    // The tablet's new cookie, as its browser would send it back
    function cookieFrom(response: Response) {
      return response.headers.getSetCookie()[0]!.split(";")[0]!;
    }

    it("gives the owner a code that expires in 10 minutes", async () => {
      const before = Date.now();
      const response = await call("POST", "/devices/pairing-code", owner);

      expect(response.status).toBe(201);
      const { pairingCode, expiresAt } = (await response.json()) as {
        pairingCode: string;
        expiresAt: string;
      };
      expect(pairingCode).toMatch(/^([A-Z0-9]{4}-){4}[A-Z0-9]{4}$/);
      expect((Date.parse(expiresAt) - before) / 60_000).toBeCloseTo(10, 0);
    });

    it("pairs a tablet that types the code, in any case and without dashes", async () => {
      const code = await newPairingCode();

      const response = await pair(code.toLowerCase().replaceAll("-", ""));

      expect(response.status).toBe(201);
      const { csrfToken } = (await response.json()) as { csrfToken: string };
      const check = await call("GET", "/devices/this", { Cookie: cookieFrom(response) });
      expect(await check.json()).toMatchObject({ csrfToken });
    });

    it("works once: a second tablet with the same code is refused", async () => {
      const code = await newPairingCode();
      await pair(code);

      const response = await pair(code);

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "wrong_pairing_code" });
    });

    it("refuses an expired code", async () => {
      const code = await newPairingCode();
      sqlite.exec("UPDATE one_time_codes SET expires_at = '2026-01-01T00:00:00.000Z'");

      const response = await pair(code);

      expect(await response.json()).toMatchObject({ error: "pairing_code_expired" });
    });

    it("stops the old code working when the owner asks for a new one", async () => {
      const oldCode = await newPairingCode();
      await newPairingCode();

      expect((await pair(oldCode)).status).toBe(401);
    });

    it("refuses the sixth try within 15 minutes, even with the right code", async () => {
      const code = await newPairingCode();
      for (let n = 0; n < 5; n += 1) {
        expect((await pair("WRONG-CODE")).status).toBe(401);
      }

      const response = await pair(code);

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "too_many_tries" });
    });

    it("replaces the old row when an already-paired tablet pairs again", async () => {
      // Still paired, so it is a cookie write and must send its CSRF token like any other
      const response = await pair(await newPairingCode(), {
        Cookie: tablet.cookie,
        "X-CSRF-Token": tablet.csrfToken,
      });

      const ids = sqlite.prepare("SELECT id FROM devices").pluck().all();
      expect(ids).toEqual([((await response.json()) as { deviceId: number }).deviceId]);
    });
  });

  describe("the owner's tablet list and revoking", () => {
    it("lists each tablet with when it was paired and its last scan, empty until U5 scans", async () => {
      const response = await call("GET", "/devices", owner);

      expect(await response.json()).toEqual([
        {
          id: tablet.deviceId,
          pairedAt: expect.any(String) as string,
          lastScanAt: null,
          lastScanAddress: null,
        },
      ]);
    });

    it("revoking ends the tablet's access on its very next request (R51)", async () => {
      const response = await call("DELETE", `/devices/${tablet.deviceId}`, owner);

      expect(response.status).toBe(204);
      expect((await call("GET", "/devices/this", { Cookie: tablet.cookie })).status).toBe(401);
    });

    it.each(["99", "abc"])("answers 404 for a tablet that doesn't exist (%s)", async (id) => {
      const response = await call("DELETE", `/devices/${id}`, owner);

      expect(response.status).toBe(404);
    });
  });
});
