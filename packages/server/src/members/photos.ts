// Member photos (R8, R14, KTD2). The desk uploads the camera's picture; the server keeps only a
// small JPEG it made itself, so nothing the phone put in the file reaches the photos folder.
// Photos of members who declined the online backup go in their own folder, which the cloud
// backup (U16) leaves out, the same way their details live in the local-only file (KTD13).
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { memberDetails } from "@jeyos/domain";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";

import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { findDetails } from "./members.service.ts";

/** Bigger uploads are refused before they are read in full. A phone photo is usually 2 to 6 MB */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

// The door and desk screens show a face, not a poster. 600 pixels is sharp on a tablet and
// keeps each saved photo around 50 KB
const SIDE = 600;

// What a phone camera or a browser's file picker gives. Decided from the file's own bytes, so a
// program renamed to photo.jpg is refused (KTD2)
const ACCEPTED = new Set(["jpeg", "png", "webp"]);

/**
 * Checks the upload is really a picture and returns the JPEG to save, or null when it isn't one.
 * Turns the picture upright using the camera's rotation tag, then saves a fresh JPEG with no
 * metadata, so the phone's location and model never reach the gym PC's disk or the backup.
 */
export async function preparePhoto(upload: Buffer): Promise<Buffer | null> {
  try {
    // limitInputPixels refuses a small file that would unpack into a huge picture and fill memory.
    // Inside the try: sharp refuses an empty upload as soon as it is handed one
    const image = sharp(upload, { limitInputPixels: 120_000_000 });
    const { format } = await image.metadata();
    if (!ACCEPTED.has(format)) {
      return null;
    }
    return await image
      .rotate()
      .resize(SIDE, SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    // sharp couldn't read it: not a picture, or a broken one
    return null;
  }
}

// photos/online-backup is copied to the cloud backup (U16); photos/local-only never is
function folderFor(photosDir: string, onlineBackup: boolean): string {
  return join(photosDir, onlineBackup ? "online-backup" : "local-only");
}

/**
 * Saves a JPEG from preparePhoto as the member's photo. A member gets one photo here, at
 * registration; replacing it is an edit that U8 adds with its audit row (R59).
 *
 * The file name is made here, never taken from the upload, so a name like ../../server.key in
 * the request can't choose where the file lands (KTD2).
 *
 * The row is marked first and the file written second. If the PC loses power in between, the
 * member shows a missing photo that staff can replace. The other order could leave a face in the
 * folder that no row points at, which an erasure (R62) would never find.
 */
export async function saveMemberPhoto(
  gym: GymDatabase,
  localOnly: LocalOnlyDatabase,
  photosDir: string,
  id: number,
  jpeg: Buffer,
): Promise<"saved" | "member_not_found" | "photo_exists"> {
  const found = findDetails(gym, localOnly, id);
  if (found === null) {
    return "member_not_found";
  }
  const fileName = `${randomBytes(16).toString("hex")}.jpg`;
  // Only while the member has no photo, so two uploads sent at once can't both win
  const { changes } = found.file
    .update(memberDetails)
    .set({ photoFileName: fileName })
    .where(and(eq(memberDetails.memberId, id), isNull(memberDetails.photoFileName)))
    .run();
  if (changes === 0) {
    return "photo_exists";
  }
  const folder = folderFor(photosDir, found.onlineBackup);
  try {
    await mkdir(folder, { recursive: true });
    // "wx" refuses to overwrite a file, though a random name never repeats in practice
    await writeFile(join(folder, fileName), jpeg, { flag: "wx" });
  } catch (error) {
    // The disk refused it: the member goes back to having no photo
    found.file
      .update(memberDetails)
      .set({ photoFileName: null })
      .where(and(eq(memberDetails.memberId, id), eq(memberDetails.photoFileName, fileName)))
      .run();
    throw error;
  }
  return "saved";
}

/** The full path of the member's photo file, or null when they have none or don't exist. */
export function memberPhotoPath(
  gym: GymDatabase,
  localOnly: LocalOnlyDatabase,
  photosDir: string,
  id: number,
): string | null {
  const found = findDetails(gym, localOnly, id);
  if (found?.details.photoFileName == null) {
    return null;
  }
  return join(folderFor(photosDir, found.onlineBackup), found.details.photoFileName);
}
