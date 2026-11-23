// The owner's staff accounts (R50, U3 plan step 3): list, add, rename, disable or enable, and
// reset a password. Only the owner may call these (R4). They change only role 'staff' rows, so no
// request here can touch the owner's account or make a second owner.
// Accounts are never deleted: a disabled account keeps its id, so the payments and check-ins it
// recorded still point at it, and those records keep the name copied onto them when entered.
import { accounts, sessions } from "@jeyos/domain";
import { addStaffSchema, resetStaffPasswordSchema, updateStaffSchema } from "@jeyos/shared";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import express from "express";
import type { Request, Router } from "express";
import type { z } from "zod";

import type { GymDatabase } from "../db/client.ts";
import { HttpError } from "../http/errors.ts";
import { validateBody } from "../http/validate.ts";
import { allow } from "./guard.ts";
import { hashPassword } from "./passwords.ts";

// The :id in the path, as a number. Anything else can't be an account, so it's "not found"
function staffIdFrom(request: Request): number {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id)) {
    throw new HttpError(404, "staff_not_found");
  }
  return id;
}

// Only staff rows: an owner's id in the path finds nothing, the same as an id that doesn't exist
function isStaff(id: number) {
  return and(eq(accounts.id, id), eq(accounts.role, "staff"));
}

/** GET /, POST /, PATCH /:id, and POST /:id/password, mounted at /api/staff. */
export function staffRouter(db: GymDatabase): Router {
  const router = express.Router();

  // Disabled accounts are listed too, so the owner can see and enable them again.
  // Password hashes stay on the server
  router.get("/", allow("owner"), (_request, response) => {
    response.json(
      db
        .select({
          id: accounts.id,
          displayName: accounts.displayName,
          signInName: accounts.signInName,
          disabled: accounts.disabled,
        })
        .from(accounts)
        .where(eq(accounts.role, "staff"))
        .orderBy(accounts.displayName)
        .all(),
    );
  });

  router.post("/", allow("owner"), validateBody(addStaffSchema), async (request, response) => {
    const { displayName, signInName, password } = request.body as z.infer<typeof addStaffSchema>;
    const hashed = await hashPassword(password);
    try {
      const { id } = db
        .insert(accounts)
        .values({ displayName, signInName, role: "staff", ...hashed })
        .returning({ id: accounts.id })
        .get();
      response.status(201).json({ id });
    } catch (error) {
      // The accounts_sign_in_name index refused it: another account, maybe a disabled one, has
      // this name in some mix of upper and lower case. Checking first and then saving could let
      // two forms sent at once both pass the check, so the database decides
      if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new HttpError(409, "sign_in_name_taken");
      }
      throw error;
    }
  });

  router.patch("/:id", allow("owner"), validateBody(updateStaffSchema), (request, response) => {
    const id = staffIdFrom(request);
    const change = request.body as z.infer<typeof updateStaffSchema>;
    db.transaction((tx) => {
      const { changes } = tx.update(accounts).set(change).where(isStaff(id)).run();
      if (changes === 0) {
        throw new HttpError(404, "staff_not_found");
      }
      // Disabling signs them out everywhere now, not at their next request
      if (change.disabled === true) {
        tx.delete(sessions).where(eq(sessions.accountId, id)).run();
      }
    });
    response.status(204).end();
  });

  router.post(
    "/:id/password",
    allow("owner"),
    validateBody(resetStaffPasswordSchema),
    async (request, response) => {
      const id = staffIdFrom(request);
      const { newPassword } = request.body as z.infer<typeof resetStaffPasswordSchema>;
      // Hashing takes a moment, so it happens before the transaction, not inside it
      const hashed = await hashPassword(newPassword);
      db.transaction((tx) => {
        const { changes } = tx.update(accounts).set(hashed).where(isStaff(id)).run();
        if (changes === 0) {
          throw new HttpError(404, "staff_not_found");
        }
        // Whoever was signed in with the old password is signed out
        tx.delete(sessions).where(eq(sessions.accountId, id)).run();
      });
      response.status(204).end();
    },
  );

  return router;
}
