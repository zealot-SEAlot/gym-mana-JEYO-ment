import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMock, json, serve } from "../test-server.ts";
import { App } from "./App.tsx";

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  serve({
    "GET /api/devices/this": json(401, { error: "signed_out" }),
    "GET /api/auth/session": json(200, null),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("shows the door tablet's pairing page at /door, with no sign-in", async () => {
    renderAt("/door");

    expect(await screen.findByRole("heading", { name: "Pair this tablet" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });

  it.each([
    ["/setup", "Set up the owner account"],
    ["/recover", "Forgot the owner password"],
  ])("shows %s with no sign-in", async (path, heading) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeDefined();
  });

  it("sends every other address to the signed-in shell", async () => {
    renderAt("/owner/staff");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeDefined();
  });
});
