import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.ts";

describe("createApp", () => {
  let folder: string;
  let server: Server;
  let baseUrl: string;

  // A fake client build in a temporary folder, and the app listening on a free port
  beforeAll(async () => {
    folder = mkdtempSync(join(tmpdir(), "jeyos-app-test-"));
    writeFileSync(join(folder, "index.html"), "<title>client page</title>");
    writeFileSync(join(folder, "app.js"), "console.log('client script');");

    server = createApp(folder).listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
    rmSync(folder, { recursive: true, force: true });
  });

  it("answers an unknown /api route with a JSON not-found error", async () => {
    const response = await fetch(`${baseUrl}/api/no-such-route`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("serves the client page at the site root", async () => {
    const response = await fetch(baseUrl);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("client page");
  });

  it("serves the client page for a screen path, so a reload does not break", async () => {
    const response = await fetch(`${baseUrl}/members/42`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("client page");
  });

  it("serves the client's built files", async () => {
    const response = await fetch(`${baseUrl}/app.js`);

    expect(await response.text()).toContain("client script");
  });

  describe("security headers", () => {
    it.each(["/api/no-such-route", "/", "/app.js"])("sends them on %s", async (path) => {
      const { headers } = await fetch(`${baseUrl}${path}`);

      expect(headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(headers.get("strict-transport-security")).toBe("max-age=31536000");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.has("x-powered-by")).toBe(false);
    });

    it("tells the browser never to store API responses", async () => {
      const { headers } = await fetch(`${baseUrl}/api/no-such-route`);

      expect(headers.get("cache-control")).toBe("no-store");
    });

    it("lets the browser cache the client's built files", async () => {
      const { headers } = await fetch(`${baseUrl}/app.js`);

      expect(headers.get("cache-control")).not.toBe("no-store");
    });
  });
});
