import { describe, expect, it } from "vitest";

import { GYM_NAME } from "@jeyos/shared";

// Placeholder: proves Vitest runs this package and resolves @jeyos imports. Replace it with the first real test.
describe("@jeyos/client", () => {
  it("reads code from @jeyos/shared", () => {
    expect(GYM_NAME).toContain("Hardhit");
  });
});
