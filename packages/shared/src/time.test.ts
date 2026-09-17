import { describe, expect, it } from "vitest";

import { addPlanLength, manilaDate } from "./time.ts";

describe("manilaDate", () => {
  it("stays on September 15 until 23:59:59 in Manila, which is 15:59:59 UTC", () => {
    expect(manilaDate(new Date("2026-09-15T15:59:59Z"))).toBe("2026-09-15");
  });

  it("moves to September 16 at midnight in Manila, which is 16:00:00 UTC", () => {
    expect(manilaDate(new Date("2026-09-15T16:00:00Z"))).toBe("2026-09-16");
  });

  it("refuses an invalid date", () => {
    expect(() => manilaDate(new Date("not a date"))).toThrow("Invalid date");
  });
});

describe("addPlanLength", () => {
  it("adds days", () => {
    expect(addPlanLength("2026-09-15", 30, "day")).toBe("2026-10-15");
  });

  it("ends on the last day of a shorter month", () => {
    expect(addPlanLength("2027-01-31", 1, "month")).toBe("2027-02-28");
  });

  it("counts months from the start date, so two months after January 31 is March 31", () => {
    expect(addPlanLength("2027-01-31", 2, "month")).toBe("2027-03-31");
  });

  it("ends on February 29 in a leap year", () => {
    expect(addPlanLength("2028-01-31", 1, "month")).toBe("2028-02-29");
  });

  it("refuses a date that is not written as YYYY-MM-DD", () => {
    expect(() => addPlanLength("15/09/2026", 1, "month")).toThrow("Invalid date");
  });

  it("refuses a day that does not exist", () => {
    expect(() => addPlanLength("2027-02-30", 1, "month")).toThrow("Invalid date");
  });

  it("refuses a length that is not a positive whole number", () => {
    expect(() => addPlanLength("2026-09-15", 0, "month")).toThrow("positive whole number");
    expect(() => addPlanLength("2026-09-15", -1, "day")).toThrow("positive whole number");
    expect(() => addPlanLength("2026-09-15", 1.5, "month")).toThrow("positive whole number");
  });
});
