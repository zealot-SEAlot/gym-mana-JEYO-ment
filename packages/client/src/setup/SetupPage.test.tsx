import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMock, json, sent, serve } from "../test-server.ts";
import { RecoveryPage, SetupPage } from "./SetupPage.tsx";

const CODE = "K7QM-2XRT-9HPA-WD3N-E5YB";

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillSetup(): void {
  type("Setup secret", "secret-from-file");
  type("Owner's name shown on records", "Jeyo");
  type("Sign-in name", "jeyo");
  type("Password", "correct horse battery");
  fireEvent.click(screen.getByRole("button", { name: "Set up" }));
}

function fillRecovery(): void {
  type("Recovery code", CODE);
  type("New password", "a brand new password");
  fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
}

const printMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  printMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("print", printMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetupPage", () => {
  it("creates the owner and shows the recovery code once, ready to print", async () => {
    serve({ "POST /api/setup": json(201, { recoveryCode: CODE }) });
    render(<SetupPage />);

    fillSetup();

    expect((await screen.findByRole("status")).textContent).toBe("The owner account is ready.");
    expect(screen.getByText(CODE)).toBeDefined();
    expect(sent()).toContainEqual({
      request: "POST /api/setup",
      body: {
        setupSecret: "secret-from-file",
        displayName: "Jeyo",
        signInName: "jeyo",
        password: "correct horse battery",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(printMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Go to sign-in" }).getAttribute("href")).toBe("/");
  });

  it("names the fields that break a rule and sends nothing", () => {
    render(<SetupPage />);

    type("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));

    expect(screen.getByText("Enter the setup secret")).toBeDefined();
    expect(screen.getByText("Use at least 12 characters")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [403, "not_on_gym_pc", "This works only on the gym PC itself."],
    [403, "setup_secret_wrong", "That setup secret is wrong."],
    [503, "setup_secret_missing", "The gym PC has no setup secret yet."],
    [409, "setup_done", "The owner account already exists. Sign in instead."],
  ])("explains a %i %s refusal", async (status, error, message) => {
    serve({ "POST /api/setup": json(status, { error }) });
    render(<SetupPage />);

    fillSetup();

    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.queryByText(CODE)).toBeNull();
  });
});

describe("RecoveryPage", () => {
  it("sets a new owner password and shows the new recovery code", async () => {
    const newCode = "WD3N-E5YB-K7QM-2XRT-9HPA";
    serve({ "POST /api/setup/recover": json(200, { recoveryCode: newCode }) });
    render(<RecoveryPage />);

    fillRecovery();

    expect((await screen.findByRole("status")).textContent).toContain(
      "The old recovery code no longer works.",
    );
    expect(screen.getByText(newCode)).toBeDefined();
    expect(sent()).toContainEqual({
      request: "POST /api/setup/recover",
      body: { recoveryCode: CODE, newPassword: "a brand new password" },
    });
  });

  it("keeps what was typed when a field breaks a rule", () => {
    render(<RecoveryPage />);

    type("Recovery code", CODE);
    type("New password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(screen.getByText("Use at least 12 characters")).toBeDefined();
    expect(screen.getByLabelText("Recovery code")).toHaveProperty("value", CODE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong_recovery_code", "That recovery code is wrong."],
    ["recovery_code_expired", "That recovery code has expired"],
    ["not_on_gym_pc", "This works only on the gym PC itself."],
  ])("explains a %s refusal", async (error, message) => {
    serve({ "POST /api/setup/recover": json(401, { error }) });
    render(<RecoveryPage />);

    fillRecovery();

    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });
});
