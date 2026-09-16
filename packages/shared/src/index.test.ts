import { describe, expect, it } from "vitest";

import { GYM_NAME } from "./index.ts";

describe("@jeyos/shared", () => {
  it("exports the gym's name", () => {
    expect(GYM_NAME).toBe("Jeyo's Hardhit Gym");
  });
});
