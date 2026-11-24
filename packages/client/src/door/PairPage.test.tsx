import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setCsrfToken } from "../api.ts";
import { fetchMock, json, noContent, sent, serve } from "../test-server.ts";
import { PairPage } from "./PairPage.tsx";

function typeCode(code: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "Pairing code" }), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "Pair" }));
}

// The token the page will send on its next write, read from what that write carries
async function csrfTokenSent(): Promise<string | undefined> {
  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(noContent());
  await api("/scan", { method: "POST", userStarted: true });
  return (fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)["X-CSRF-Token"];
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PairPage", () => {
  it("says a paired tablet is paired and keeps its CSRF token for scans", async () => {
    serve({ "GET /api/devices/this": json(200, { deviceId: 1, csrfToken: "csrf-door" }) });
    render(<PairPage />);

    expect((await screen.findByRole("status")).textContent).toBe(
      "This tablet is paired as the door tablet.",
    );
    expect(screen.queryByRole("textbox", { name: "Pairing code" })).toBeNull();
    expect(await csrfTokenSent()).toBe("csrf-door");
  });

  it("pairs an unpaired tablet with the owner's code", async () => {
    serve({
      "GET /api/devices/this": json(401, { error: "signed_out" }),
      "POST /api/devices/pair": json(201, { deviceId: 2, csrfToken: "csrf-new" }),
    });
    render(<PairPage />);
    await screen.findByRole("heading", { name: "Pair this tablet" });

    typeCode("k7qm 2xrt 9hpa wd3n e5yb");

    expect((await screen.findByRole("status")).textContent).toBe(
      "This tablet is paired as the door tablet.",
    );
    expect(sent()).toContainEqual({
      request: "POST /api/devices/pair",
      body: { pairingCode: "k7qm 2xrt 9hpa wd3n e5yb" },
    });
    expect(await csrfTokenSent()).toBe("csrf-new");
  });

  it("shows the form in a browser that is signed in but not paired", async () => {
    serve({ "GET /api/devices/this": json(403, { error: "not_allowed" }) });
    render(<PairPage />);

    expect(await screen.findByRole("heading", { name: "Pair this tablet" })).toBeDefined();
  });

  it("asks for a code and sends nothing when the field is empty", async () => {
    serve({ "GET /api/devices/this": json(401, { error: "signed_out" }) });
    render(<PairPage />);
    await screen.findByRole("heading", { name: "Pair this tablet" });

    typeCode("   ");

    expect(screen.getByText("Enter the pairing code")).toBeDefined();
    expect(sent().map(({ request }) => request)).not.toContain("POST /api/devices/pair");
  });

  it.each([
    [
      json(401, { error: "wrong_pairing_code" }),
      "That code is wrong. Check it against the owner's Devices screen.",
    ],
    [
      json(401, { error: "pairing_code_expired" }),
      "That code has expired. Ask the owner for a new one.",
    ],
    [
      () =>
        new Response(JSON.stringify({ error: "too_many_tries" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        }),
      "Too many wrong tries. Try again in 1 minute.",
    ],
  ])("says what went wrong with the code (%#)", async (answer, message) => {
    serve({
      "GET /api/devices/this": json(401, { error: "signed_out" }),
      "POST /api/devices/pair": answer,
    });
    render(<PairPage />);
    await screen.findByRole("heading", { name: "Pair this tablet" });

    typeCode("K7QM-2XRT-9HPA-WD3N-E5YB");

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByRole("textbox", { name: "Pairing code" })).toBeDefined();
  });
});
