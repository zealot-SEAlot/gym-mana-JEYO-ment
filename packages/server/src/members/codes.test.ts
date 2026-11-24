import { describe, expect, it } from "vitest";

import { newMemberCode } from "./codes.ts";

describe("member codes", () => {
  it("makes 32 upper-case hex characters", () => {
    expect(newMemberCode()).toMatch(/^[0-9A-F]{32}$/);
  });

  it("never repeats across 10,000 codes", () => {
    const codes = new Set(Array.from({ length: 10_000 }, () => newMemberCode()));

    expect(codes.size).toBe(10_000);
  });
});
