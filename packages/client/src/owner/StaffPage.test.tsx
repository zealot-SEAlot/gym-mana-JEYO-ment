import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMock, json, noContent, sent, serve } from "../test-server.ts";
import { StaffPage } from "./StaffPage.tsx";

const LEE = { id: 3, displayName: "Lee", signInName: "lee", disabled: false };
const ANA = { id: 4, displayName: "Ana", signInName: "ana", disabled: true };

// The row for one staff member, to find its buttons and fields
async function rowOf(name: string): Promise<HTMLElement> {
  const row = (await screen.findByText(name)).closest("li");
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

function type(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StaffPage", () => {
  it("lists every staff account, disabled ones too", async () => {
    serve({ "GET /api/staff": json(200, [ANA, LEE]) });
    render(<StaffPage />);

    expect((await rowOf("Lee")).textContent).toContain("signs in as lee · Active");
    expect((await rowOf("Ana")).textContent).toContain("signs in as ana · Disabled");
  });

  it("says when there are no staff accounts yet", async () => {
    serve({ "GET /api/staff": json(200, []) });
    render(<StaffPage />);

    expect(await screen.findByText("No staff accounts yet.")).toBeDefined();
  });

  it("says when the list can't be loaded", async () => {
    serve({});
    render(<StaffPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the gym PC.");
  });

  it("adds an account, clears the form, and shows it in the list", async () => {
    let list = [ANA];
    serve({
      "GET /api/staff": () => json(200, list)(),
      "POST /api/staff": () => {
        list = [ANA, LEE];
        return json(201, { id: 3 })();
      },
    });
    render(<StaffPage />);
    await rowOf("Ana");

    type(screen.getByRole("textbox", { name: "Name shown on records" }), "Lee");
    type(screen.getByRole("textbox", { name: "Sign-in name" }), "lee");
    type(screen.getByLabelText("Password"), "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: "Add staff account" }));

    expect((await screen.findByRole("status")).textContent).toBe("Added Lee.");
    expect(await rowOf("Lee")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Name shown on records" })).toHaveProperty(
      "value",
      "",
    );
    expect(sent()).toContainEqual({
      request: "POST /api/staff",
      body: { displayName: "Lee", signInName: "lee", password: "correct horse battery" },
    });
  });

  it("names the fields that break a rule and sends nothing", async () => {
    serve({ "GET /api/staff": json(200, []) });
    render(<StaffPage />);
    await screen.findByText("No staff accounts yet.");

    type(screen.getByLabelText("Password"), "short");
    fireEvent.click(screen.getByRole("button", { name: "Add staff account" }));

    expect(screen.getByText("Enter a name")).toBeDefined();
    expect(screen.getByText("Use at least 12 characters")).toBeDefined();
    expect(sent().map(({ request }) => request)).not.toContain("POST /api/staff");
  });

  it("says when the sign-in name is taken, even by a disabled account", async () => {
    serve({
      "GET /api/staff": json(200, [ANA]),
      "POST /api/staff": json(409, { error: "sign_in_name_taken" }),
    });
    render(<StaffPage />);
    await rowOf("Ana");

    type(screen.getByRole("textbox", { name: "Name shown on records" }), "Ana Cruz");
    type(screen.getByRole("textbox", { name: "Sign-in name" }), "ANA");
    type(screen.getByLabelText("Password"), "correct horse battery");
    fireEvent.click(screen.getByRole("button", { name: "Add staff account" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Another account already uses this sign-in name",
    );
  });

  it("disables an active account and enables a disabled one", async () => {
    serve({
      "GET /api/staff": json(200, [ANA, LEE]),
      "PATCH /api/staff/3": noContent,
      "PATCH /api/staff/4": noContent,
    });
    render(<StaffPage />);

    fireEvent.click(within(await rowOf("Lee")).getByRole("button", { name: "Disable Lee" }));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Disabled Lee. They are signed out and can't sign in.",
    );
    fireEvent.click(within(await rowOf("Ana")).getByRole("button", { name: "Enable Ana" }));
    await screen.findByText("Enabled Ana. They can sign in again.");

    expect(sent()).toContainEqual({ request: "PATCH /api/staff/3", body: { disabled: true } });
    expect(sent()).toContainEqual({ request: "PATCH /api/staff/4", body: { disabled: false } });
  });

  it("renames an account", async () => {
    serve({ "GET /api/staff": json(200, [LEE]), "PATCH /api/staff/3": noContent });
    render(<StaffPage />);
    const row = await rowOf("Lee");

    type(within(row).getByRole("textbox", { name: "New name" }), "Lee Santos");
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Renamed Lee to Lee Santos. Records entered before keep the old name.",
    );
    expect(sent()).toContainEqual({
      request: "PATCH /api/staff/3",
      body: { displayName: "Lee Santos" },
    });
  });

  it("sets a new password, keeping a too-short one in the field to fix", async () => {
    serve({ "GET /api/staff": json(200, [LEE]), "POST /api/staff/3/password": noContent });
    render(<StaffPage />);
    const row = await rowOf("Lee");
    const field = within(row).getByLabelText("New password");

    type(field, "short");
    fireEvent.click(within(row).getByRole("button", { name: "Set new password" }));
    expect(within(row).getByText("Use at least 12 characters")).toBeDefined();
    expect(field).toHaveProperty("value", "short");

    type(field, "a brand new password");
    fireEvent.click(within(row).getByRole("button", { name: "Set new password" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Set a new password for Lee. They are signed out everywhere.",
    );
    await vi.waitFor(() => {
      expect(field).toHaveProperty("value", "");
    });
    expect(sent()).toContainEqual({
      request: "POST /api/staff/3/password",
      body: { newPassword: "a brand new password" },
    });
  });

  it("says when an account is gone", async () => {
    serve({
      "GET /api/staff": json(200, [LEE]),
      "PATCH /api/staff/3": json(404, { error: "staff_not_found" }),
    });
    render(<StaffPage />);

    fireEvent.click(within(await rowOf("Lee")).getByRole("button", { name: "Disable Lee" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This account is gone. Reload the screen.",
    );
  });
});
