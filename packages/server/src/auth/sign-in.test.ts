import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type Database from "better-sqlite3";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { errorHandler } from "../http/errors.ts";
import { hashPassword } from "./passwords.ts";
import { requireCsrfToken } from "./csrf.ts";
import { loadSession, signedInAs, signInRouter } from "./sign-in.ts";

const PASSWORD = "correct horse battery";

describe("signing in and out", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    ({ sqlite, db } = openTestDatabase());
    const { passwordHash, passwordHashMethod } = await hashPassword(PASSWORD);
    sqlite
      .prepare(
        "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (2, 'Lee', 'Lee', 'staff', ?, ?)",
      )
      .run(passwordHash, passwordHashMethod);

    await startServer();
  });

  // The sign-in routes as app.ts mounts them, plus a /who route that answers signedInAs(request).
  // Calling it again stands in for restarting the server: a new app on the same database
  async function startServer() {
    const app = express();
    app.use(express.json());
    app.use(loadSession(db));
    app.use(requireCsrfToken);
    app.use("/auth", signInRouter(db));
    app.get("/who", (request, response) => {
      response.json(signedInAs(request));
    });
    // Stands in for any route that changes data, like recording a payment
    app.post("/write", (_request, response) => {
      response.status(204).end();
    });
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise((done) => server.close(done));
    sqlite.close();
  });

  function signIn(signInName: string, password: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ signInName, password }),
    });
  }

  // Signs Lee in and returns what the browser keeps: the cookie, and the page's CSRF token
  async function signInLee() {
    const response = await signIn("lee", PASSWORD);
    const { csrfToken } = (await response.json()) as { csrfToken: string };
    return { cookie: cookieFrom(response), csrfToken };
  }

  function post(path: string, headers: Record<string, string>) {
    return fetch(`${baseUrl}${path}`, { method: "POST", headers });
  }

  // The "name=value" part of the Set-Cookie header, as the browser would send it back
  function cookieFrom(response: Response): string {
    return response.headers.get("Set-Cookie")?.split(";")[0] ?? "";
  }

  async function who(cookie: string, headers: Record<string, string> = {}) {
    const response = await fetch(`${baseUrl}/who`, { headers: { Cookie: cookie, ...headers } });
    return response.json();
  }

  it("signs in with the right password, ignoring the name's upper and lower case", async () => {
    const response = await signIn("LEE", PASSWORD);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      displayName: string;
      role: string;
      csrfToken: string;
    };
    expect(body).toEqual({ displayName: "Lee", role: "staff", csrfToken: body.csrfToken });
    // 32 random bytes in base64url
    expect(body.csrfToken).toMatch(/^[\w-]{43}$/);
    expect(await who(cookieFrom(response))).toMatchObject({ accountId: 2, displayName: "Lee" });
  });

  it("sends the token in a cookie page scripts can't read and other sites can't trigger", async () => {
    const setCookie = (await signIn("lee", PASSWORD)).headers.get("Set-Cookie");

    expect(setCookie).toMatch(/^__Host-jeyos-session=[\w-]{43};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
  });

  it.each([
    ["a wrong password", "lee", "wrong horse battery"],
    ["an unknown sign-in name", "nobody", PASSWORD],
  ])("gives the same answer for %s, and no cookie", async (_label, name, password) => {
    const response = await signIn(name, password);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "wrong_sign_in" });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("refuses a disabled account with the same answer, even with the right password (R50)", async () => {
    sqlite.exec("UPDATE accounts SET disabled = 1 WHERE id = 2");

    const response = await signIn("lee", PASSWORD);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "wrong_sign_in" });
  });

  it("names the empty fields of an incomplete form", async () => {
    const response = await signIn(" ", "");

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      details: { fields: Record<string, string[]> };
    };
    expect(body.error).toBe("invalid_request");
    expect(body.details.fields).toEqual({
      signInName: ["Enter your sign-in name"],
      password: ["Enter your password"],
    });
  });

  it("treats a request with no cookie, or a made-up one, as signed out", async () => {
    expect(await who("")).toBeNull();
    expect(await who("__Host-jeyos-session=made-up")).toBeNull();
  });

  it("signs out: the cookie is cleared and its token never works again", async () => {
    const { cookie, csrfToken } = await signInLee();

    const response = await post("/auth/sign-out", { Cookie: cookie, "X-CSRF-Token": csrfToken });

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toMatch(
      /^__Host-jeyos-session=;.*Expires=Thu, 01 Jan 1970/,
    );
    expect(await who(cookie)).toBeNull();
  });

  it("ends the old session when the same browser signs in again", async () => {
    const { cookie: before, csrfToken } = await signInLee();
    const after = cookieFrom(
      await signIn("lee", PASSWORD, { Cookie: before, "X-CSRF-Token": csrfToken }),
    );

    expect(await who(before)).toBeNull();
    expect(await who(after)).not.toBeNull();
    expect(sqlite.prepare("SELECT count(*) FROM sessions").pluck().get()).toBe(1);
  });

  it("restarts the idle clock only for requests marked X-User-Action (KTD10)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T01:00:00.000Z"));
    const cookie = cookieFrom(await signIn("lee", PASSWORD));
    const lastActive = () => sqlite.prepare("SELECT last_active_at FROM sessions").pluck().get();

    vi.setSystemTime(new Date("2026-11-23T01:10:00.000Z"));
    await who(cookie);
    expect(lastActive()).toBe("2026-11-23T01:00:00.000Z");

    await who(cookie, { "X-User-Action": "1" });
    expect(lastActive()).toBe("2026-11-23T01:10:00.000Z");
  });

  describe("five tries per sign-in name every 15 minutes", () => {
    async function statuses(count: number, password: string) {
      const responses = [];
      for (let n = 0; n < count; n += 1) {
        responses.push(await signIn("lee", password));
      }
      return responses.map((response) => response.status);
    }

    it("refuses the sixth try, even with the right password, and says how long to wait", async () => {
      expect(await statuses(5, "wrong horse battery")).toEqual([401, 401, 401, 401, 401]);

      const response = await signIn("lee", PASSWORD);

      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "too_many_tries" });
      expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(890);
    });

    it("still refuses after a server restart, because the count is in the database", async () => {
      await statuses(5, "wrong horse battery");
      await new Promise((done) => server.close(done));

      await startServer();

      expect((await signIn("lee", PASSWORD)).status).toBe(429);
    });

    it("forgets the wrong passwords once the right one is typed", async () => {
      await statuses(4, "wrong horse battery");
      expect((await signIn("lee", PASSWORD)).status).toBe(200);

      expect(await statuses(5, "wrong horse battery")).toEqual([401, 401, 401, 401, 401]);
    });

    it("limits a made-up name too, so the limit can't reveal which names exist", async () => {
      for (let n = 0; n < 5; n += 1) {
        await signIn("nobody", PASSWORD);
      }

      expect((await signIn("NOBODY", PASSWORD)).status).toBe(429);
    });

    it("lets only five of ten guesses sent at once be checked", async () => {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => signIn("lee", "wrong horse battery")),
      );
      const counts = responses.map((response) => response.status).sort();

      expect(counts).toEqual([401, 401, 401, 401, 401, 429, 429, 429, 429, 429]);
    });
  });

  describe("CSRF token (KTD5)", () => {
    it("refuses a signed-in write with no token or a wrong one", async () => {
      const { cookie, csrfToken } = await signInLee();

      const noTokenThenWrongToken: Record<string, string>[] = [
        { Cookie: cookie },
        { Cookie: cookie, "X-CSRF-Token": "x".repeat(43) },
      ];
      for (const headers of noTokenThenWrongToken) {
        const response = await post("/write", headers);
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "csrf_token_wrong" });
      }
      // A token from another session doesn't work either
      const other = await signIn("lee", PASSWORD);
      const { csrfToken: otherToken } = (await other.json()) as { csrfToken: string };
      expect((await post("/write", { Cookie: cookie, "X-CSRF-Token": otherToken })).status).toBe(
        403,
      );

      expect((await post("/write", { Cookie: cookie, "X-CSRF-Token": csrfToken })).status).toBe(
        204,
      );
    });

    it("doesn't let another website sign someone out", async () => {
      const { cookie } = await signInLee();

      expect((await post("/auth/sign-out", { Cookie: cookie })).status).toBe(403);
      expect(await who(cookie)).not.toBeNull();
    });

    it("leaves reads and signed-out requests to the route guard", async () => {
      const { cookie } = await signInLee();

      expect(await who(cookie)).not.toBeNull();
      expect((await post("/write", {})).status).toBe(204);
    });

    it("gives the page its token again after a reload, and null when signed out", async () => {
      const { cookie, csrfToken } = await signInLee();

      const response = await fetch(`${baseUrl}/auth/session`, { headers: { Cookie: cookie } });

      expect(await response.json()).toEqual({ displayName: "Lee", role: "staff", csrfToken });
      expect(await (await fetch(`${baseUrl}/auth/session`)).json()).toBeNull();
    });
  });
});
