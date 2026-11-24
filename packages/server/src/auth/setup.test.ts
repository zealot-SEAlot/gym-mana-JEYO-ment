import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { openGymDatabase, openLocalOnlyDatabase } from "../db/client.ts";
import { hashCode } from "./one-time-codes.ts";

// Built with repeat, so CI's secret scanner (gitleaks) can't mistake a test value for a real key
const SECRET = "test-setup-secret-".repeat(2);
const FORM = {
  setupSecret: SECRET,
  displayName: "Jeyo",
  signInName: "jeyo",
  password: "correct horse battery",
};

// The gym PC's Wi-Fi address, if this machine has one. Connecting to it is like a phone on the
// gym Wi-Fi connecting to the gym PC: the connection doesn't arrive on loopback
const wifiAddress = Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === "IPv4" && !address.internal)?.address;

describe("owner setup", () => {
  let folder: string;
  let sqlite: Database.Database;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), "jeyos-setup-test-"));
    writeFileSync(join(folder, "setup-secret.txt"), `${SECRET}\n`);
    writeFileSync(join(folder, "index.html"), "<title>client page</title>");
    // A fresh database with no accounts at all, like a new install
    const db = openGymDatabase(":memory:");
    sqlite = db.$client;
    // Listening on every address, like the real server, so the Wi-Fi test can reach it
    server = createApp({
      clientDir: folder,
      setupSecretFile: join(folder, "setup-secret.txt"),
      db,
      localOnlyDb: openLocalOnlyDatabase(":memory:"),
    }).listen(0, "0.0.0.0");
    await new Promise((done) => server.once("listening", done));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise((done) => server.close(done));
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  });

  // node:http instead of fetch, because fetch won't let a test set the Host header
  function post(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
    address = "127.0.0.1",
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const outgoing = httpRequest(
        {
          host: address,
          port,
          path,
          method: "POST",
          headers: { "Content-Type": "application/json", Host: `localhost:${port}`, ...headers },
        },
        (response) => {
          let text = "";
          response.on("data", (chunk: Buffer) => (text += chunk.toString()));
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              body: JSON.parse(text) as Record<string, unknown>,
            });
          });
        },
      );
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify(body));
    });
  }

  const owners = () =>
    sqlite.prepare("SELECT sign_in_name FROM accounts WHERE role = 'owner'").pluck().all();

  it("creates the owner and gives a recovery code that is stored only as a hash", async () => {
    const before = Date.now();

    const { status, body } = await post("/api/setup", FORM);

    expect(status).toBe(201);
    const code = body["recoveryCode"] as string;
    expect(code).toMatch(/^(\w{4}-){4}\w{4}$/);
    expect(owners()).toEqual(["jeyo"]);
    const stored = sqlite
      .prepare("SELECT purpose, code_hash, expires_at FROM one_time_codes")
      .get() as {
      purpose: string;
      code_hash: string;
      expires_at: string;
    };
    expect(stored.purpose).toBe("recovery");
    expect(stored.code_hash).toBe(hashCode(code));
    // One year, the placeholder until the owner decides
    const days = (Date.parse(stored.expires_at) - before) / 86_400_000;
    expect(Math.round(days)).toBe(365);
  });

  it("lets the new owner sign in with the password from setup", async () => {
    await post("/api/setup", FORM);

    const { status, body } = await post("/api/auth/sign-in", {
      signInName: "jeyo",
      password: "correct horse battery",
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ displayName: "Jeyo", role: "owner" });
  });

  it("refuses a second setup, so there is only ever one owner", async () => {
    await post("/api/setup", FORM);

    const { status, body } = await post("/api/setup", { ...FORM, signInName: "intruder" });

    expect(status).toBe(409);
    expect(body).toEqual({ error: "setup_done" });
    expect(owners()).toEqual(["jeyo"]);
  });

  it("creates one owner when two setup forms arrive at once", async () => {
    const results = await Promise.all([
      post("/api/setup", FORM),
      post("/api/setup", { ...FORM, signInName: "second" }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(owners()).toHaveLength(1);
  });

  it("refuses a wrong setup secret, and says so when the install script never wrote one", async () => {
    expect(await post("/api/setup", { ...FORM, setupSecret: "guess" })).toEqual({
      status: 403,
      body: { error: "setup_secret_wrong" },
    });

    rmSync(join(folder, "setup-secret.txt"));

    expect(await post("/api/setup", FORM)).toEqual({
      status: 503,
      body: { error: "setup_secret_missing" },
    });
    expect(owners()).toEqual([]);
  });

  it("refuses a password the shared rule doesn't allow", async () => {
    const { status } = await post("/api/setup", { ...FORM, password: "short" });

    expect(status).toBe(400);
    expect(owners()).toEqual([]);
  });

  it.each([
    ["the gym PC's network name in Host", { Host: "gym-pc.lan" }],
    ["another website's name in Host, pointed at 127.0.0.1", { Host: "evil.example" }],
    ["another website's page as the Origin", { Origin: "https://evil.example" }],
  ])("refuses a loopback request with %s", async (_label, headers) => {
    expect(await post("/api/setup", FORM, headers)).toEqual({
      status: 403,
      body: { error: "not_on_gym_pc" },
    });
  });

  it.skipIf(wifiAddress === undefined)(
    "refuses a device on the Wi-Fi, even one claiming to be the gym PC in its headers",
    async () => {
      const result = await post(
        "/api/setup",
        FORM,
        { "X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1", Origin: "https://localhost" },
        wifiAddress,
      );

      expect(result).toEqual({ status: 403, body: { error: "not_on_gym_pc" } });
      expect(owners()).toEqual([]);
    },
  );

  describe("recovery code", () => {
    const NEW_PASSWORD = "a brand new passphrase";

    // Runs setup and returns the printed recovery code
    async function setUp(): Promise<string> {
      const { body } = await post("/api/setup", FORM);
      return body["recoveryCode"] as string;
    }

    function signInStatus(password: string) {
      return post("/api/auth/sign-in", { signInName: "jeyo", password }).then((r) => r.status);
    }

    it("sets a new password, ends every owner session, and hands out a fresh code", async () => {
      const code = await setUp();
      await signInStatus(FORM.password);
      await signInStatus(FORM.password);

      const { status, body } = await post("/api/setup/recover", {
        recoveryCode: code,
        newPassword: NEW_PASSWORD,
      });

      expect(status).toBe(200);
      expect(sqlite.prepare("SELECT count(*) FROM sessions").pluck().get()).toBe(0);
      expect(await signInStatus(FORM.password)).toBe(401);
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
      const fresh = body["recoveryCode"] as string;
      expect(fresh).not.toBe(code);
      expect(sqlite.prepare("SELECT code_hash FROM one_time_codes").pluck().all()).toEqual([
        hashCode(fresh),
      ]);
    });

    it("accepts the code typed in lower case with spaces", async () => {
      const code = await setUp();

      const { status } = await post("/api/setup/recover", {
        recoveryCode: code.toLowerCase().replaceAll("-", " "),
        newPassword: NEW_PASSWORD,
      });

      expect(status).toBe(200);
    });

    it("refuses the same code a second time", async () => {
      const code = await setUp();
      await post("/api/setup/recover", { recoveryCode: code, newPassword: NEW_PASSWORD });

      expect(
        await post("/api/setup/recover", {
          recoveryCode: code,
          newPassword: "someone else's pick",
        }),
      ).toEqual({ status: 401, body: { error: "wrong_recovery_code" } });
      expect(await signInStatus(NEW_PASSWORD)).toBe(200);
    });

    it("lets only one of two resets sent at once use the code", async () => {
      const code = await setUp();

      const results = await Promise.all([
        post("/api/setup/recover", { recoveryCode: code, newPassword: NEW_PASSWORD }),
        post("/api/setup/recover", { recoveryCode: code, newPassword: "someone else's pick" }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    });

    it("refuses an expired code and leaves the password alone", async () => {
      const code = await setUp();
      sqlite.exec("UPDATE one_time_codes SET expires_at = '2026-01-01T00:00:00.000Z'");

      expect(
        await post("/api/setup/recover", { recoveryCode: code, newPassword: NEW_PASSWORD }),
      ).toEqual({ status: 401, body: { error: "recovery_code_expired" } });
      expect(await signInStatus(FORM.password)).toBe(200);
    });

    it("refuses the sixth try within 15 minutes, even with the right code", async () => {
      const code = await setUp();
      const wrong = { recoveryCode: "AAAA-AAAA-AAAA-AAAA-AAAA", newPassword: NEW_PASSWORD };

      for (let n = 0; n < 5; n += 1) {
        expect((await post("/api/setup/recover", wrong)).status).toBe(401);
      }

      const sixth = await post("/api/setup/recover", {
        recoveryCode: code,
        newPassword: NEW_PASSWORD,
      });
      expect(sixth).toEqual({ status: 429, body: { error: "too_many_tries" } });
    });

    it("works only on the gym PC", async () => {
      const code = await setUp();

      const result = await post(
        "/api/setup/recover",
        { recoveryCode: code, newPassword: NEW_PASSWORD },
        { Origin: "https://evil.example" },
      );

      expect(result).toEqual({ status: 403, body: { error: "not_on_gym_pc" } });
      expect(await signInStatus(FORM.password)).toBe(200);
    });

    it("refuses a new password the shared rule doesn't allow", async () => {
      const code = await setUp();

      const { status } = await post("/api/setup/recover", {
        recoveryCode: code,
        newPassword: "short",
      });

      expect(status).toBe(400);
    });
  });
});
