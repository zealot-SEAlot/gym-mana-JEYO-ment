import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setCsrfToken } from "../api.ts";
import { AppShell } from "./AppShell.tsx";
import type { Screen } from "./screens.tsx";

// Stands in for the server: each test lists what each "METHOD /path" answers
const fetchMock = vi.fn<typeof fetch>();

function serve(routes: Record<string, () => Response>): void {
  fetchMock.mockImplementation((url, init) => {
    // api() always passes the address as a string
    const route = routes[`${init?.method ?? "GET"} ${url as string}`];
    return route ? Promise.resolve(route()) : Promise.reject(new TypeError("Failed to fetch"));
  });
}

function json(status: number, body: unknown): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

const LEE = { displayName: "Lee", role: "staff", csrfToken: "csrf-lee" };
const OWNER = { displayName: "Jeyo", role: "owner", csrfToken: "csrf-owner" };

// Two made-up screens, one in each group, so the tests don't depend on which real screens exist
function LeaveScreen() {
  return (
    <>
      <h1>Leave requests</h1>
      <button
        type="button"
        onClick={() => {
          void api("/leave", { userStarted: true }).catch(() => undefined);
        }}
      >
        Reload
      </button>
    </>
  );
}

const SCREENS: Screen[] = [
  { path: "/leave", label: "Leave", group: "desk", element: <LeaveScreen /> },
  { path: "/owner/prices", label: "Prices", group: "owner", element: <h1>Prices</h1> },
];

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell screens={SCREENS} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("shows the sign-in screen when nobody is signed in, then the shell after sign-in", async () => {
    serve({
      "GET /api/auth/session": json(200, null),
      "POST /api/auth/sign-in": json(200, LEE),
    });
    renderAt("/");

    fireEvent.change(await screen.findByRole("textbox", { name: "Sign-in name" }), {
      target: { value: "lee" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Lee" })).toBeDefined();
  });

  it("goes straight to the screen after a reload, with the CSRF token for writes", async () => {
    serve({
      "GET /api/auth/session": json(200, LEE),
      "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
    });
    renderAt("/leave");

    expect(await screen.findByRole("heading", { name: "Leave requests" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers["X-CSRF-Token"]).toBe("csrf-lee");
  });

  it("shows staff only the front desk group", async () => {
    serve({ "GET /api/auth/session": json(200, LEE) });
    renderAt("/");

    const menu = await screen.findByRole("navigation", { name: "Screens" });
    expect(within(menu).getByRole("heading", { name: "Front desk" })).toBeDefined();
    expect(within(menu).getByRole("link", { name: "Leave" })).toBeDefined();
    expect(within(menu).queryByRole("heading", { name: "Owner" })).toBeNull();
    expect(within(menu).queryByRole("link", { name: "Prices" })).toBeNull();
  });

  it("shows the owner both groups, and marks the open screen", async () => {
    serve({ "GET /api/auth/session": json(200, OWNER) });
    renderAt("/owner/prices");

    expect(await screen.findByRole("heading", { name: "Prices" })).toBeDefined();
    const menu = screen.getByRole("navigation", { name: "Screens" });
    expect(within(menu).getByRole("link", { name: "Leave" })).toBeDefined();
    expect(within(menu).getByRole("link", { name: "Prices" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("has no owner screen for staff who type its address", async () => {
    serve({ "GET /api/auth/session": json(200, LEE) });
    renderAt("/owner/prices");

    expect(await screen.findByRole("heading", { name: "No screen here" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Prices" })).toBeNull();
  });

  it("signs out and returns to the sign-in screen", async () => {
    serve({
      "GET /api/auth/session": json(200, LEE),
      "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
    });
    renderAt("/leave");

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeDefined();
  });

  it("stays signed in and says so when sign-out can't reach the gym PC", async () => {
    serve({ "GET /api/auth/session": json(200, LEE) });
    renderAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't sign out.");
    expect(screen.getByRole("heading", { name: "Welcome, Lee" })).toBeDefined();
  });

  it("shows the sign-in screen when a screen's request finds the session ended", async () => {
    serve({
      "GET /api/auth/session": json(200, LEE),
      "GET /api/leave": json(401, { error: "signed_out" }),
    });
    renderAt("/leave");

    fireEvent.click(await screen.findByRole("button", { name: "Reload" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeDefined();
  });

  it("shows the sign-in screen when the gym PC can't be reached on load", async () => {
    serve({});
    renderAt("/");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeDefined();
  });
});
