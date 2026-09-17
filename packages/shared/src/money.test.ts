import { describe, expect, it } from "vitest";

import { formatCentavos, pesosToCentavos } from "./money.ts";

describe("pesosToCentavos", () => {
  it("turns 1.15 into exactly 115, where 1.15 * 100 would give 114.99999999999999", () => {
    expect(pesosToCentavos("1.15")).toBe(115);
  });

  it("turns amounts with two decimal places into whole centavos", () => {
    expect(pesosToCentavos("0.29")).toBe(29);
    expect(pesosToCentavos("800.50")).toBe(80050);
  });

  it("accepts one decimal place or none", () => {
    expect(pesosToCentavos("800.5")).toBe(80050);
    expect(pesosToCentavos("800")).toBe(80000);
    expect(pesosToCentavos("0")).toBe(0);
  });

  it("refuses more than two decimal places", () => {
    expect(() => pesosToCentavos("1.155")).toThrow("Invalid amount");
  });

  it("refuses negative amounts", () => {
    expect(() => pesosToCentavos("-5")).toThrow("Invalid amount");
  });

  it("refuses text that is not a plain number", () => {
    for (const text of ["", "abc", "1,000", "₱800", ".50", "800.", " 800"]) {
      expect(() => pesosToCentavos(text)).toThrow("Invalid amount");
    }
  });

  it("refuses an amount too large to count exactly", () => {
    expect(() => pesosToCentavos("100000000000000000")).toThrow("Invalid amount");
  });
});

describe("formatCentavos", () => {
  it("shows centavos as pesos with two decimal places", () => {
    expect(formatCentavos(80050)).toBe("₱800.50");
    expect(formatCentavos(115)).toBe("₱1.15");
    expect(formatCentavos(5)).toBe("₱0.05");
  });

  it("separates thousands with commas", () => {
    expect(formatCentavos(150000)).toBe("₱1,500.00");
  });

  it("puts the minus sign before the peso sign", () => {
    expect(formatCentavos(-5000)).toBe("-₱50.00");
  });

  it("refuses a value that is not a whole number of centavos", () => {
    expect(() => formatCentavos(1.5)).toThrow("whole number of centavos");
  });
});
