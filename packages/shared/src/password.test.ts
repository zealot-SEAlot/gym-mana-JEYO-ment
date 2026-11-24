import { describe, expect, it } from "vitest";

import { passwordSchema } from "./password.ts";

describe("passwordSchema", () => {
  it.each([
    ["exactly 12 characters", "abcdefghijkl"],
    ["72 bytes of plain letters", "a".repeat(72)],
    ["12 characters that include an emoji", `${"a".repeat(11)}💪`],
    ["24 peso signs, exactly 72 bytes", "₱".repeat(24)],
    ["18 emoji, exactly 72 bytes", "💪".repeat(18)],
  ])("accepts %s", (_label, password) => {
    expect(passwordSchema.safeParse(password).success).toBe(true);
  });

  it.each([
    ["11 characters", "abcdefghijk", "Use at least 12 characters"],
    // JavaScript's .length counts 💪 twice, so this would pass a plain .min(12)
    ["10 letters and an emoji", `${"a".repeat(10)}💪`, "Use at least 12 characters"],
    ["73 bytes", "a".repeat(73), "Use a shorter password"],
    // 36 ñ are only 36 characters, but 72 bytes; one more is over the limit
    ["37 two-byte letters", "ñ".repeat(37), "Use a shorter password"],
    // ₱ is 3 bytes: 24 of them make 72 bytes, and one more letter is over
    ["24 peso signs and a letter", `${"₱".repeat(24)}a`, "Use a shorter password"],
    // 💪 is 4 bytes: 18 of them make 72 bytes, and one more letter is over
    ["18 emoji and a letter", `${"💪".repeat(18)}a`, "Use a shorter password"],
  ])("refuses %s", (_label, password, message) => {
    const result = passwordSchema.safeParse(password);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });
});
