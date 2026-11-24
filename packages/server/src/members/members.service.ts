// Registering members and reading them back (R8, R9, R53). Built in U4; U8 adds edits and erasure.
// A member is three rows: members (the code, no personal data), consents (the three answers),
// and member_details (name, phone, email, photo). The online-backup answer decides which file
// holds member_details: the gym database, or the local-only file Litestream never copies (KTD13).
import { consents, memberDetails, members } from "@jeyos/domain";
import type { RegisterMember } from "@jeyos/shared";
import { and, desc, eq } from "drizzle-orm";

import type { SignedIn } from "../auth/sessions.ts";
import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { enteredNow } from "../db/record-columns.ts";
import { newMemberCode } from "./codes.ts";

export interface Member {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasPhoto: boolean;
}

/**
 * Saves a new member and returns their id and QR code. Photos come separately (U4b), so a
 * member who declines one simply never gets one (R8).
 *
 * Two files, one outcome: the gym rows go in first, inside the gym transaction, and the details
 * go in last. If the details can't be saved, the error rolls the gym rows back, so no member is
 * left without a name. If the clock guard (KTD7) refuses the member row, nothing reaches either file.
 */
export function registerMember(
  gym: GymDatabase,
  localOnly: LocalOnlyDatabase,
  form: RegisterMember,
  by: Pick<SignedIn, "accountId" | "displayName">,
  now: Date,
): { id: number; code: string } {
  const entered = enteredNow(by, now);
  return gym.transaction((tx) => {
    const { id, code } = tx
      .insert(members)
      .values({ ...entered, code: newMemberCode() })
      .returning({ id: members.id, code: members.code })
      .get();
    tx.insert(consents)
      .values({
        ...entered,
        memberId: id,
        consentTextVersion: form.consentTextVersion,
        storeOnGymPc: form.storeOnGymPc,
        onlineBackup: form.onlineBackup,
        reminders: form.reminders,
      })
      .run();
    const details = { memberId: id, name: form.name, phone: form.phone, email: form.email };
    if (form.onlineBackup) {
      tx.insert(memberDetails).values(details).run();
    } else {
      // ponytail: the one gap is a gym commit that fails after this line (disk full, power cut
      // mid-save). This row then stays behind, and the next member gets the same id, so this
      // overwrites it instead of refusing that member
      localOnly
        .insert(memberDetails)
        .values(details)
        .onConflictDoUpdate({ target: memberDetails.memberId, set: details })
        .run();
    }
    // The column allows empty only after an erasure, so a new member always has a code
    return { id, code: code! };
  });
}

/**
 * Where a member's details live and what they say, or null for an id that doesn't exist or was
 * erased (R62). onlineBackup says which file: photos.ts uses it to pick the photo folder too.
 */
export function findDetails(gym: GymDatabase, localOnly: LocalOnlyDatabase, id: number) {
  const member = gym
    .select({ code: members.code, onlineBackup: consents.onlineBackup })
    .from(members)
    .innerJoin(consents, eq(consents.memberId, members.id))
    .where(and(eq(members.id, id), eq(members.erased, false)))
    // A change of mind adds a consent row, and the newest one counts (R8)
    .orderBy(desc(consents.id))
    .limit(1)
    .get();
  if (member === undefined) {
    return null;
  }
  // Read from the file the newest answer points at, never "whichever has a row": a row left
  // behind in the other file must not show
  const file = member.onlineBackup ? gym : localOnly;
  const details = file.select().from(memberDetails).where(eq(memberDetails.memberId, id)).get();
  if (details === undefined) {
    return null;
  }
  return { file, onlineBackup: member.onlineBackup, code: member.code!, details };
}

/** A member with their details, or null for an id that doesn't exist or was erased (R62). */
export function findMember(
  gym: GymDatabase,
  localOnly: LocalOnlyDatabase,
  id: number,
): Member | null {
  const found = findDetails(gym, localOnly, id);
  if (found === null) {
    return null;
  }
  const { code, details } = found;
  return {
    id,
    code,
    name: details.name,
    phone: details.phone,
    email: details.email,
    hasPhoto: details.photoFileName !== null,
  };
}
