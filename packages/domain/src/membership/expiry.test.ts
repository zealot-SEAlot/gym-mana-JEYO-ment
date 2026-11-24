import { describe, expect, it } from "vitest";

import { expiryDate, isActiveOn } from "./expiry.ts";

describe("expiry", () => {
  it("starts from the owner's carried-over date", () => {
    expect(expiryDate({ carriedOverExpiresOn: "2026-10-30" })).toBe("2026-10-30");
  });

  it("gives no expiry to a member with nothing in their ledger", () => {
    expect(expiryDate({ carriedOverExpiresOn: null })).toBeNull();
  });

  it.each([
    ["the day before", "2026-10-29", true],
    ["the expiry day itself", "2026-10-30", true],
    ["the day after", "2026-10-31", false],
    ["a later month", "2026-11-01", false],
    ["a later year with a smaller month", "2027-01-15", false],
  ])("with expiry on October 30, counts %s as active: %s", (_label, day, active) => {
    expect(isActiveOn("2026-10-30", day)).toBe(active);
  });

  it("never counts a member with no expiry as active", () => {
    expect(isActiveOn(null, "2026-10-30")).toBe(false);
  });
});
