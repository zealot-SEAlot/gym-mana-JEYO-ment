import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, setCsrfToken } from "../api.ts";
import { LoginPage } from "./LoginPage.tsx";

// Stands in for the server: each test says what fetch answers
const fetchMock = vi.fn<typeof fetch>();

function answer(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// A password input has no ARIA role, so it's found by its label instead
function fillIn(signInName: string, password: string): void {
  fireEvent.change(screen.getByRole("textbox", { name: "Sign-in name" }), {
    target: { value: signInName },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

function signIn(): void {
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginPage", () => {
  it("signs in, reports who signed in, and keeps the CSRF token for later writes", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { displayName: "Lee", role: "staff", csrfToken: "csrf-1" }),
    );
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);

    fillIn("lee", "correct horse battery");
    signIn();

    await vi.waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledWith({ displayName: "Lee", role: "staff" });
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/sign-in");
    expect(JSON.parse(init?.body as string)).toEqual({
      signInName: "lee",
      password: "correct horse battery",
    });

    // The next write carries the token sign-in gave
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api("/auth/sign-out", { method: "POST", userStarted: true });
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "csrf-1",
    );
  });

  it("links to owner setup and recovery for the gym PC", () => {
    render(<LoginPage onSignedIn={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "set up the owner account" }).getAttribute("href"),
    ).toBe("/setup");
    expect(screen.getByRole("link", { name: "use the recovery code" }).getAttribute("href")).toBe(
      "/recover",
    );
  });

  it("names the empty fields and sends nothing", () => {
    render(<LoginPage onSignedIn={vi.fn()} />);

    signIn();

    expect(screen.getByRole("textbox", { name: "Sign-in name" }).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByText("Enter your sign-in name")).toBeDefined();
    expect(screen.getByText("Enter your password")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the name or password is wrong, keeps the name, and clears the password", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { error: "wrong_sign_in" }));
    const onSignedIn = vi.fn();
    render(<LoginPage onSignedIn={onSignedIn} />);

    fillIn("lee", "wrong password!!");
    signIn();

    expect((await screen.findByRole("alert")).textContent).toBe("Wrong sign-in name or password.");
    expect(screen.getByRole("textbox", { name: "Sign-in name" })).toHaveProperty("value", "lee");
    expect(screen.getByLabelText("Password")).toHaveProperty("value", "");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("says how many minutes to wait after too many wrong tries", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(429, { error: "too_many_tries" }, { "Retry-After": "540" }),
    );
    render(<LoginPage onSignedIn={vi.fn()} />);

    fillIn("lee", "another guess");
    signIn();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many wrong tries. Try again in 9 minutes.",
    );
  });

  it("says when the gym PC can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<LoginPage onSignedIn={vi.fn()} />);

    fillIn("lee", "correct horse battery");
    signIn();

    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the gym PC.");
  });

  it("shows a general message for an error it has no words for", async () => {
    fetchMock.mockResolvedValueOnce(answer(500, { error: "server_error" }));
    render(<LoginPage onSignedIn={vi.fn()} />);

    fillIn("lee", "correct horse battery");
    signIn();

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
  });

  it("can't be sent twice while the first try is still out", () => {
    // An answer that never comes, so the form stays busy
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    render(<LoginPage onSignedIn={vi.fn()} />);

    fillIn("lee", "correct horse battery");
    signIn();

    expect(screen.getByRole("button", { name: "Signing in…" })).toHaveProperty("disabled", true);
  });
});
