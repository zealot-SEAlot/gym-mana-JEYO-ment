import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { openLocalOnlyDatabase } from "../db/client.ts";
import type { GymDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { startSession } from "./sessions.ts";

const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "staple battery horse";

describe("staff accounts", () => {
  let sqlite: Database.Database;
  let db: GymDatabase;
  let server: Server;
  let baseUrl: string;
  // The owner's browser: its session cookie and CSRF token
  let owner: Record<string, string>;

  beforeEach(async () => {
    ({ sqlite, db } = openTestDatabase());
    // The staff routes never read the client build or the setup secret, so neither file exists
    server = createApp({
      clientDir: "no-client",
      setupSecretFile: "no-secret",
      db,
      localOnlyDb: openLocalOnlyDatabase(":memory:"),
    }).listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    // The test database's owner has no real password, so the session is started directly
    const { token, csrfToken } = startSession(db, 1, new Date());
    owner = { Cookie: `__Host-jeyos-session=${token}`, "X-CSRF-Token": csrfToken };
  });

  afterEach(async () => {
    await new Promise((done) => server.close(done));
    sqlite.close();
  });

  function call(method: string, path: string, body?: unknown, headers = owner) {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function addLee(signInName = "lee") {
    const response = await call("POST", "/staff", {
      displayName: "Lee",
      signInName,
      password: PASSWORD,
    });
    return ((await response.json()) as { id: number }).id;
  }

  // Signs in with no cookie of its own and returns the new session cookie, or null when refused
  async function signIn(signInName: string, password: string) {
    const response = await call("POST", "/auth/sign-in", { signInName, password }, {});
    return response.ok ? response.headers.getSetCookie()[0]!.split(";")[0]! : null;
  }

  async function sessionOf(cookie: string) {
    const response = await call("GET", "/auth/session", undefined, { Cookie: cookie });
    return response.json() as Promise<{ displayName: string } | null>;
  }

  it("adds a staff account that can then sign in, and lists it without its password", async () => {
    const id = await addLee();

    const list = await call("GET", "/staff");
    expect(await list.json()).toEqual([
      { id, displayName: "Lee", signInName: "lee", disabled: false },
    ]);
    expect(await signIn("lee", PASSWORD)).not.toBeNull();
  });

  it("makes staff even when the request asks for the owner role", async () => {
    await call("POST", "/staff", {
      displayName: "Lee",
      signInName: "lee",
      password: PASSWORD,
      role: "owner",
    });

    const roles = sqlite.prepare("SELECT role FROM accounts ORDER BY id").pluck().all();
    expect(roles).toEqual(["owner", "staff"]);
  });

  it.each(["lee", "LEE", "jeyo"])(
    "refuses a sign-in name already in use (%s), in any case",
    async (name) => {
      await addLee();

      const response = await call("POST", "/staff", {
        displayName: "Another",
        signInName: name,
        password: PASSWORD,
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "sign_in_name_taken" });
    },
  );

  it("refuses a disabled account's sign-in name", async () => {
    const id = await addLee();
    await call("PATCH", `/staff/${id}`, { disabled: true });

    const response = await call("POST", "/staff", {
      displayName: "New Lee",
      signInName: "lee",
      password: PASSWORD,
    });

    expect(response.status).toBe(409);
  });

  it("refuses a password shorter than 12 characters", async () => {
    const response = await call("POST", "/staff", {
      displayName: "Lee",
      signInName: "lee",
      password: "short",
    });

    expect(response.status).toBe(400);
  });

  it("renames an account, keeping its sign-in name", async () => {
    const id = await addLee();

    await call("PATCH", `/staff/${id}`, { displayName: "Lee Santos" });

    const cookie = await signIn("lee", PASSWORD);
    expect(await sessionOf(cookie!)).toMatchObject({ displayName: "Lee Santos" });
  });

  it("disabling signs the account out at once and stops sign-in; enabling allows it again", async () => {
    const id = await addLee();
    const cookie = await signIn("lee", PASSWORD);

    expect((await call("PATCH", `/staff/${id}`, { disabled: true })).status).toBe(204);

    expect(await sessionOf(cookie!)).toBeNull();
    expect(await signIn("lee", PASSWORD)).toBeNull();
    // The row stays, so the records it entered still point at it (R50)
    expect(sqlite.prepare("SELECT count(*) FROM accounts WHERE id = ?").pluck().get(id)).toBe(1);

    await call("PATCH", `/staff/${id}`, { disabled: false });
    expect(await signIn("lee", PASSWORD)).not.toBeNull();
  });

  it("resets a password: the old one stops working and the old session ends", async () => {
    const id = await addLee();
    const cookie = await signIn("lee", PASSWORD);

    const response = await call("POST", `/staff/${id}/password`, { newPassword: NEW_PASSWORD });

    expect(response.status).toBe(204);
    expect(await sessionOf(cookie!)).toBeNull();
    expect(await signIn("lee", PASSWORD)).toBeNull();
    expect(await signIn("lee", NEW_PASSWORD)).not.toBeNull();
  });

  it("refuses a change that names nothing it may change, like the role", async () => {
    const id = await addLee();

    const response = await call("PATCH", `/staff/${id}`, { role: "owner" });

    expect(response.status).toBe(400);
  });

  describe("an id that is not a staff account", () => {
    // 1 is the owner, 99 doesn't exist, and "lee" isn't a number
    it.each(["1", "99", "lee"])("answers 404 for %s", async (id) => {
      const rename = await call("PATCH", `/staff/${id}`, { displayName: "Taken Over" });
      const reset = await call("POST", `/staff/${id}/password`, { newPassword: NEW_PASSWORD });

      expect([rename.status, reset.status]).toEqual([404, 404]);
      expect(sqlite.prepare("SELECT display_name FROM accounts WHERE id = 1").pluck().get()).toBe(
        "Jeyo",
      );
    });
  });
});
