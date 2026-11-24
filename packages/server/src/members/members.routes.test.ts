// The member routes through real HTTP, signed in as staff. Who may call them is the permission
// matrix's job (permission-matrix.test.ts); the rules for saving are in members.service.test.ts
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONSENT_TEXT } from "@jeyos/shared";
import type Database from "better-sqlite3";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app.ts";
import { startSession } from "../auth/sessions.ts";
import { openTestDatabase } from "../db/test-database.ts";

// What the Register screen sends for a member who agrees to everything
const FORM = {
  name: "Ana Cruz",
  phone: "0917 123 4567",
  email: "",
  consentTextVersion: CONSENT_TEXT.version,
  storeOnGymPc: true,
  onlineBackup: true,
  reminders: true,
};

describe("member routes", () => {
  let sqlite: Database.Database;
  let server: Server;
  let baseUrl: string;
  // Lee's browser at the desk: session cookie and CSRF token
  let staff: Record<string, string>;
  let photosDir: string;

  beforeEach(async () => {
    photosDir = join(mkdtempSync(join(tmpdir(), "jeyos-member-routes-test-")), "photos");
    const { db, localOnlyDb } = openTestDatabase();
    sqlite = db.$client;
    sqlite.exec(
      "INSERT INTO accounts (id, display_name, sign_in_name, role, password_hash, password_hash_method) VALUES (2, 'Lee', 'lee', 'staff', 'hash', 'argon2id')",
    );
    server = createApp({
      clientDir: "no-client",
      setupSecretFile: "no-secret",
      db,
      localOnlyDb,
      photosDir,
    }).listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
    const { token, csrfToken } = startSession(db, 2, new Date());
    staff = { Cookie: `__Host-jeyos-session=${token}`, "X-CSRF-Token": csrfToken };
  });

  afterEach(async () => {
    await new Promise((done) => server.close(done));
    sqlite.close();
    rmSync(join(photosDir, ".."), { recursive: true, force: true });
  });

  function call(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...staff },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function register(form: object = FORM) {
    const response = await call("POST", "/members", form);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  it("registers a member at the desk and reads them back", async () => {
    const { status, body } = await register();

    expect(status).toBe(201);
    const member = await (await call("GET", `/members/${String(body.id)}`)).json();
    expect(member).toEqual({
      id: body.id,
      code: body.code,
      name: "Ana Cruz",
      phone: "09171234567",
      email: null,
      hasPhoto: false,
    });
    // Lee's name is copied onto the member row (R50)
    expect(sqlite.prepare("SELECT entered_by_name FROM members").get()).toEqual({
      entered_by_name: "Lee",
    });
  });

  it("refuses a member who doesn't agree to storing data on the gym PC, naming the checkbox", async () => {
    const { status, body } = await register({ ...FORM, storeOnGymPc: false });

    expect(status).toBe(400);
    expect(body).toEqual({
      error: "invalid_request",
      details: { fields: { storeOnGymPc: ["The member must agree to this to register"] } },
    });
    expect(sqlite.prepare("SELECT count(*) AS n FROM members").get()).toEqual({ n: 0 });
  });

  it("draws each member's code as an SVG picture for the card", async () => {
    const first = await register();
    const second = await register({ ...FORM, name: "Ben Reyes" });

    const response = await call("GET", `/members/${String(first.body.id)}/qr.svg`);
    const picture = await response.text();
    const otherPicture = await (
      await call("GET", `/members/${String(second.body.id)}/qr.svg`)
    ).text();

    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(picture).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(picture).not.toBe(otherPicture);
  });

  it.each([["999"], ["abc"]])("answers not found for member %s", async (id) => {
    const response = await call("GET", `/members/${id}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "member_not_found" });
  });

  describe("photos", () => {
    // A phone photo as the camera sends it: the picture's own bytes are the request body
    async function upload(id: unknown, bytes: Buffer, headers: Record<string, string> = {}) {
      return fetch(`${baseUrl}/api/members/${String(id)}/photo`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", ...staff, ...headers },
        body: bytes,
      });
    }

    const photo = () =>
      sharp({ create: { width: 1200, height: 900, channels: 3, background: "#808080" } })
        .jpeg()
        .toBuffer();

    it("saves an uploaded photo and shows it back as a small JPEG", async () => {
      const { body } = await register();

      expect((await upload(body.id, await photo())).status).toBe(204);

      const response = await call("GET", `/members/${String(body.id)}/photo`);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({
        format: "jpeg",
        width: 600,
        height: 450,
      });
      expect(await (await call("GET", `/members/${String(body.id)}`)).json()).toMatchObject({
        hasPhoto: true,
      });
    });

    it("ignores a file name sent with the photo, so ../ can't choose where it lands", async () => {
      const { body } = await register();

      await upload(body.id, await photo(), {
        "Content-Disposition": 'attachment; filename="../../setup-secret.txt"',
      });

      expect(readdirSync(join(photosDir, "..")).sort()).toEqual(["photos"]);
      expect(readdirSync(join(photosDir, "online-backup"))).toEqual([
        expect.stringMatching(/^[0-9a-f]{32}\.jpg$/) as unknown,
      ]);
    });

    it("refuses a renamed program, whatever the request says it is", async () => {
      const { body } = await register();
      const response = await upload(body.id, Buffer.concat([Buffer.from("MZ"), Buffer.alloc(500)]));

      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "not_a_photo" });
    });

    it("refuses a 12 MB upload", async () => {
      const { body } = await register();
      const response = await upload(body.id, Buffer.alloc(12 * 1024 * 1024));

      expect(response.status).toBe(413);
      expect(readdirSync(join(photosDir, ".."))).toEqual([]);
    });

    it("refuses a second photo, and answers not found for a member or photo that doesn't exist", async () => {
      const { body } = await register();
      await upload(body.id, await photo());

      expect((await upload(body.id, await photo())).status).toBe(409);
      expect((await upload(999, await photo())).status).toBe(404);
      const { body: other } = await register({ ...FORM, name: "Ben Reyes" });
      expect(await (await call("GET", `/members/${String(other.id)}/photo`)).json()).toEqual({
        error: "photo_not_found",
      });
    });

    it("answers not found when the photo file went missing after a power cut", async () => {
      const { body } = await register();
      await upload(body.id, await photo());
      rmSync(join(photosDir, "online-backup"), { recursive: true });

      const response = await call("GET", `/members/${String(body.id)}/photo`);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "photo_not_found" });
    });
  });
});
