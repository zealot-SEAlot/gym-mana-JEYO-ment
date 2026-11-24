// The account roles (R3, R4). Here in shared so the database schema, the server's route guard, and
// the client's navigation shell all use the same two names.
export const ACCOUNT_ROLES = ["owner", "staff"] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];
