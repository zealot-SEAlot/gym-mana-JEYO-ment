// Code the browser and the server both use: request schemas, money, the Manila-day helper, role names.
export const GYM_NAME = "Jeyo's Hardhit Fitness Center";

export {
  addStaffSchema,
  displayNameSchema,
  resetStaffPasswordSchema,
  signInNameSchema,
  updateStaffSchema,
} from "./accounts.ts";
export { pairDeviceSchema } from "./devices.ts";
export { ACCOUNT_ROLES, type AccountRole } from "./roles.ts";
export { formatCentavos, pesosToCentavos } from "./money.ts";
export { passwordSchema } from "./password.ts";
export { recoverySchema, setupSchema } from "./setup.ts";
export { signInSchema } from "./sign-in.ts";
export { addPlanLength, manilaDate, PLAN_LENGTH_UNITS, type PlanLengthUnit } from "./time.ts";
