// Money as whole centavos, never as decimal JavaScript numbers (plan: KTD7).

// Digits, then optionally a dot and one or two more digits: 800, 800.5, 800.50
const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

/** Turns an amount typed as text, such as "800.50", into whole centavos (80050). */
export function pesosToCentavos(text: string): number {
  const match = AMOUNT.exec(text);
  if (match === null) {
    throw new Error(`Invalid amount: "${text}". Type a number like 800 or 800.50`);
  }
  // Work with the digits on each side of the dot, so no decimal number is ever multiplied
  const [, pesos = "", fraction = ""] = match;
  const centavos = Number(pesos) * 100 + Number(fraction.padEnd(2, "0"));
  // Past about 90 trillion pesos, JavaScript numbers stop counting every centavo exactly
  if (!Number.isSafeInteger(centavos)) {
    throw new Error(`Invalid amount: "${text}" is too large`);
  }
  return centavos;
}

/** Shows whole centavos as pesos for screens and printouts, such as 80050 as "₱800.50". */
export function formatCentavos(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new Error(`Expected a whole number of centavos, got ${centavos}`);
  }
  const sign = centavos < 0 ? "-" : "";
  const absolute = Math.abs(centavos);
  // Insert a comma before every group of three digits counted from the right: 1500 becomes 1,500
  const pesos = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}₱${pesos}.${fraction}`;
}
