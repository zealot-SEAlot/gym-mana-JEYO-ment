import { describe, expect, it } from "vitest";

import { hashCode, newCode } from "./one-time-codes.ts";

describe("one-time codes", () => {
  it("makes 20 easy-to-copy characters in groups of four, different each time", () => {
    const first = newCode();
    const second = newCode();

    expect(first.code).toMatch(/^[A-HJKMNP-TW-Z2-9]{4}(-[A-HJKMNP-TW-Z2-9]{4}){4}$/);
    expect(first.code).not.toBe(second.code);
  });

  it("stores a 64-character hash, never the code", () => {
    const { code, codeHash } = newCode();

    expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(codeHash).toBe(hashCode(code));
  });

  it("matches a code typed in lower case, with spaces or without dashes", () => {
    const { code, codeHash } = newCode();

    expect(hashCode(code.toLowerCase().replaceAll("-", " "))).toBe(codeHash);
    expect(hashCode(code.replaceAll("-", ""))).toBe(codeHash);
    expect(hashCode(newCode().code)).not.toBe(codeHash);
  });
});
