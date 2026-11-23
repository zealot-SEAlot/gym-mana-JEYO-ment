// Every screen behind sign-in, and which menu group it sits in (KTD14, KTD20). Later units add their
// screens to SCREENS: "desk" screens are for the owner and staff, "owner" screens for the owner only
// (R4). The menu and the routes are both built from this one list, so a screen can't be in the menu
// without a route, or the other way round.
// Leaving a screen out of a role's menu is not access control: the server's allow(...) on each /api
// route is (KTD6).
import type { AccountRole } from "@jeyos/shared";
import type { ReactNode } from "react";

import { StaffPage } from "../owner/StaffPage.tsx";

export type ScreenGroup = "desk" | "owner";

export interface Screen {
  // The address, such as "/owner/staff"
  path: string;
  // The menu text
  label: string;
  group: ScreenGroup;
  element: ReactNode;
}

// In menu order
export const GROUP_LABELS: Record<ScreenGroup, string> = {
  desk: "Front desk",
  owner: "Owner",
};

// Staff see the front desk screens; the owner sees those and the owner screens
const GROUPS_FOR: Record<AccountRole, readonly ScreenGroup[]> = {
  staff: ["desk"],
  owner: ["desk", "owner"],
};

/** The screens this role's menu and routes include. */
export function screensFor(role: AccountRole, screens: readonly Screen[]): Screen[] {
  return screens.filter((screen) => GROUPS_FOR[role].includes(screen.group));
}

export const SCREENS: readonly Screen[] = [
  { path: "/owner/staff", label: "Staff", group: "owner", element: <StaffPage /> },
];
