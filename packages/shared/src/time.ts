// Calendar days in Manila and plan-length date math (plan: KTD7).
import { DateTime } from "luxon";

const MANILA = "Asia/Manila";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PlanLengthUnit = "day" | "month";

/** The calendar day in Manila, written as YYYY-MM-DD, for a moment in time. */
export function manilaDate(instant: Date): string {
  // Luxon works in Manila time whatever time zone the PC itself is set to
  const day = DateTime.fromJSDate(instant, { zone: MANILA }).toISODate();
  if (day === null) {
    throw new Error(`Invalid date: ${String(instant)}`);
  }
  return day;
}

/** A Manila calendar day plus a plan length. A month that is too short ends on its last day. */
export function addPlanLength(date: string, length: number, unit: PlanLengthUnit): string {
  const start = DateTime.fromISO(date, { zone: MANILA });
  // The pattern rejects other formats; isValid rejects days that don't exist, like February 30
  if (!ISO_DATE.test(date) || !start.isValid) {
    throw new Error(`Invalid date: ${date}`);
  }
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error(`Plan length must be a positive whole number, got ${length}`);
  }
  // Luxon's month addition ends on the last day of a shorter month: January 31 + 1 month = February 28
  const end = unit === "month" ? start.plus({ months: length }) : start.plus({ days: length });
  const day = end.toISODate();
  if (day === null) {
    throw new Error(`Invalid date: ${date}`);
  }
  return day;
}
