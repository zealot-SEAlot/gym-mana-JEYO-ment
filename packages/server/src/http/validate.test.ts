import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandler, HttpError } from "./errors.ts";
import { validateBody } from "./validate.ts";

// A small app with test routes, wired the same way createApp wires the API
describe("validateBody and errorHandler", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post(
      "/members",
      validateBody(z.object({ name: z.string().trim().min(1), phone: z.string() })),
      (request, response) => {
        response.json({ received: request.body as unknown });
      },
    );
    app.get("/members/7", () => {
      throw new HttpError(404, "member_not_found");
    });
    app.get("/broken", () => {
      throw new Error("secret file path C:\\gym-data");
    });
    app.use(errorHandler);

    server = app.listen(0);
    await new Promise((done) => server.once("listening", done));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
  });

  function post(body: string) {
    return fetch(`${baseUrl}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  it("lets a valid body through, cleaned by the schema", async () => {
    const response = await post(JSON.stringify({ name: "  Ana  ", phone: "0917", extra: "x" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: { name: "Ana", phone: "0917" } });
  });

  it("answers a body that fails its schema with a validation error naming the fields", async () => {
    const response = await post(JSON.stringify({ name: "   " }));

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      details: { fields: Record<string, string[]> };
    };
    expect(body.error).toBe("invalid_request");
    expect(Object.keys(body.details.fields).sort()).toEqual(["name", "phone"]);
  });

  it("answers broken JSON with a bad request error", async () => {
    const response = await post("{ name: ");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
  });

  it("answers an HttpError with its status and code", async () => {
    const response = await fetch(`${baseUrl}/members/7`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "member_not_found" });
  });

  it("answers an unexpected error with 500 and hides its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await fetch(`${baseUrl}/broken`);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("gym-data");
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
