import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, setCsrfToken, setSignedOutHandler } from "./api.ts";

// Stands in for the server: each test says what fetch answers, then reads what was sent
const fetchMock = vi.fn<typeof fetch>();

function sentHeaders(): Record<string, string> {
  return fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("returns the JSON answer from /api plus the path", async () => {
    fetchMock.mockResolvedValue(json(200, { role: "owner" }));

    expect(await api("/auth/session", { userStarted: true })).toEqual({ role: "owner" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/session");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("marks a request the user started, and leaves an automatic reload unmarked", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/staff", { userStarted: true });
    expect(sentHeaders()["X-User-Action"]).toBe("1");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/staff", { userStarted: false });
    expect(sentHeaders()).not.toHaveProperty("X-User-Action");
  });

  it("sends the CSRF token once the page has one, and stops after sign-out", async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/staff", { userStarted: true });
    expect(sentHeaders()).not.toHaveProperty("X-CSRF-Token");

    setCsrfToken("token-from-sign-in");
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/staff", { userStarted: true });
    expect(sentHeaders()["X-CSRF-Token"]).toBe("token-from-sign-in");

    setCsrfToken(null);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json(200, {}));
    await api("/staff", { userStarted: true });
    expect(sentHeaders()).not.toHaveProperty("X-CSRF-Token");
  });

  it("sends a body as JSON", async () => {
    fetchMock.mockResolvedValue(json(201, { id: 7 }));

    await api("/staff", { method: "POST", body: { displayName: "Lee" }, userStarted: true });

    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"displayName":"Lee"}');
    expect(sentHeaders()["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for an empty 204 answer", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    expect(await api("/auth/sign-out", { method: "POST", userStarted: true })).toBeUndefined();
  });

  it("throws the server's error code, details, and wait time", async () => {
    fetchMock.mockResolvedValue(json(429, { error: "too_many_tries" }, { "Retry-After": "600" }));

    const error = await api("/auth/sign-in", { method: "POST", userStarted: true }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "too_many_tries", retryAfterSeconds: 600 });
  });

  it("passes on which fields were wrong", async () => {
    const details = { fields: { password: ["Use at least 12 characters"] } };
    fetchMock.mockResolvedValue(json(400, { error: "invalid_request", details }));

    await expect(api("/staff", { method: "POST", userStarted: true })).rejects.toMatchObject({
      code: "invalid_request",
      details,
      retryAfterSeconds: null,
    });
  });

  it("calls an answer that isn't JSON a server error", async () => {
    fetchMock.mockResolvedValue(new Response("<h1>Bad Gateway</h1>", { status: 502 }));

    await expect(api("/staff", { userStarted: true })).rejects.toMatchObject({
      status: 502,
      code: "server_error",
    });
  });

  it("tells the shell when the session has ended, and still throws", async () => {
    const signedOut = vi.fn();
    setSignedOutHandler(signedOut);
    fetchMock.mockResolvedValue(json(401, { error: "signed_out" }));

    await expect(api("/staff", { userStarted: true })).rejects.toMatchObject({
      code: "signed_out",
    });
    expect(signedOut).toHaveBeenCalledOnce();

    // A wrong password is also a 401, but the session didn't end
    signedOut.mockClear();
    fetchMock.mockResolvedValue(json(401, { error: "wrong_sign_in" }));
    await api("/auth/sign-in", { method: "POST", userStarted: true }).catch(() => undefined);
    expect(signedOut).not.toHaveBeenCalled();
    setSignedOutHandler(() => undefined);
  });

  it("says the server is unreachable when no answer comes back", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api("/staff", { userStarted: true })).rejects.toMatchObject({
      status: 0,
      code: "server_unreachable",
    });
  });
});
