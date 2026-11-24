import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMock, json, noContent, sent, serve } from "../test-server.ts";
import { DevicesPage } from "./DevicesPage.tsx";

// Paired 1:15 pm UTC, which is 9:15 pm in Manila; never scanned
const NEW_TABLET = {
  id: 1,
  pairedAt: "2026-11-23T13:15:00.000Z",
  lastScanAt: null,
  lastScanAddress: null,
};
// Last scanned 11:40 pm UTC on the 22nd, which is 7:40 am on the 23rd in Manila
const DOOR_TABLET = {
  id: 2,
  pairedAt: "2026-11-01T01:00:00.000Z",
  lastScanAt: "2026-11-22T23:40:00.000Z",
  lastScanAddress: "192.168.1.40",
};

async function rowOf(name: string): Promise<HTMLElement> {
  const row = (await screen.findByText(name)).closest("li");
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

// The owner's answer to "Revoke tablet …?"
const confirmMock = vi.fn<(message?: string) => boolean>();

beforeEach(() => {
  fetchMock.mockReset();
  confirmMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DevicesPage", () => {
  it("lists each tablet with when it was paired and its last scan in gym time", async () => {
    serve({ "GET /api/devices": json(200, [NEW_TABLET, DOOR_TABLET]) });
    render(<DevicesPage />);

    const fresh = (await rowOf("Tablet 1")).textContent;
    expect(fresh).toContain("Nov 23, 2026");
    expect(fresh).toContain("9:15");
    expect(fresh).toContain("last scan none yet");
    const door = (await rowOf("Tablet 2")).textContent;
    expect(door).toContain("Nov 23, 2026, 7:40");
    expect(door).toContain("from 192.168.1.40");
  });

  it("says when no tablet is paired", async () => {
    serve({ "GET /api/devices": json(200, []) });
    render(<DevicesPage />);

    expect(await screen.findByText("No tablet is paired.")).toBeDefined();
  });

  it("says when the list can't be loaded", async () => {
    serve({});
    render(<DevicesPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the gym PC.");
  });

  it("shows a pairing code with where to type it and when it stops working", async () => {
    serve({
      "GET /api/devices": json(200, []),
      "POST /api/devices/pairing-code": json(201, {
        pairingCode: "K7QM-2XRT-9HPA-WD3N-E5YB",
        expiresAt: "2026-11-23T13:25:00.000Z",
      }),
    });
    render(<DevicesPage />);
    await screen.findByText("No tablet is paired.");

    fireEvent.click(screen.getByRole("button", { name: "Get a pairing code" }));

    expect(await screen.findByText("K7QM-2XRT-9HPA-WD3N-E5YB")).toBeDefined();
    expect(screen.getByText(/stops working at/).textContent).toContain("9:25");
    expect(screen.getByText(/stops working at/).textContent).toContain("/door");
    expect(screen.getByRole("button", { name: "Get a new code" })).toBeDefined();
  });

  it("says when a pairing code can't be made", async () => {
    serve({
      "GET /api/devices": json(200, []),
      "POST /api/devices/pairing-code": json(500, { error: "server_error" }),
    });
    render(<DevicesPage />);
    await screen.findByText("No tablet is paired.");

    fireEvent.click(screen.getByRole("button", { name: "Get a pairing code" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
  });

  it("revokes a tablet after the owner confirms, and removes it from the list", async () => {
    let list = [NEW_TABLET, DOOR_TABLET];
    serve({
      "GET /api/devices": () => json(200, list)(),
      "DELETE /api/devices/2": () => {
        list = [NEW_TABLET];
        return noContent();
      },
    });
    confirmMock.mockReturnValue(true);
    render(<DevicesPage />);

    fireEvent.click(
      within(await rowOf("Tablet 2")).getByRole("button", { name: "Revoke tablet 2" }),
    );

    expect((await screen.findByRole("status")).textContent).toBe(
      "Revoked tablet 2. It can't scan until it is paired again.",
    );
    expect(screen.queryByText("Tablet 2")).toBeNull();
    expect(confirmMock).toHaveBeenCalledWith(
      "Revoke tablet 2? It stops scanning until you pair it again.",
    );
  });

  it("keeps the tablet when the owner says no", async () => {
    serve({ "GET /api/devices": json(200, [DOOR_TABLET]) });
    confirmMock.mockReturnValue(false);
    render(<DevicesPage />);

    fireEvent.click(
      within(await rowOf("Tablet 2")).getByRole("button", { name: "Revoke tablet 2" }),
    );

    expect(sent().map(({ request }) => request)).not.toContain("DELETE /api/devices/2");
  });

  it("says when the tablet was already revoked", async () => {
    serve({
      "GET /api/devices": json(200, [DOOR_TABLET]),
      "DELETE /api/devices/2": json(404, { error: "device_not_found" }),
    });
    confirmMock.mockReturnValue(true);
    render(<DevicesPage />);

    fireEvent.click(
      within(await rowOf("Tablet 2")).getByRole("button", { name: "Revoke tablet 2" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That tablet was already revoked. Refresh the list.",
    );
  });

  it("shows a newly paired tablet after a refresh", async () => {
    let list: (typeof NEW_TABLET)[] = [];
    serve({ "GET /api/devices": () => json(200, list)() });
    render(<DevicesPage />);
    await screen.findByText("No tablet is paired.");

    list = [NEW_TABLET];
    fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));

    expect(await rowOf("Tablet 1")).toBeDefined();
  });
});
