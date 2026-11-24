// Test pictures are drawn here with sharp, not stored as files: CI refuses image files outside
// e2e/fixtures, and a drawn picture shows exactly what each test feeds in
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONSENT_TEXT, registerMemberSchema } from "@jeyos/shared";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GymDatabase, LocalOnlyDatabase } from "../db/client.ts";
import { openTestDatabase } from "../db/test-database.ts";
import { findMember, registerMember } from "./members.service.ts";
import { memberPhotoPath, preparePhoto, saveMemberPhoto } from "./photos.ts";

// A plain grey picture of the given size, ready to save as any format
function picture(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 120, b: 120 } } });
}

describe("preparePhoto", () => {
  it("shrinks a big phone photo to fit 600 pixels and saves it as JPEG", async () => {
    const saved = await preparePhoto(await picture(4000, 3000).jpeg().toBuffer());

    expect(await sharp(saved!).metadata()).toMatchObject({
      format: "jpeg",
      width: 600,
      height: 450,
    });
  });

  it("turns a PNG or WebP into JPEG, and leaves a small picture its own size", async () => {
    for (const upload of [
      await picture(200, 300).png().toBuffer(),
      await picture(200, 300).webp().toBuffer(),
    ]) {
      expect(await sharp((await preparePhoto(upload))!).metadata()).toMatchObject({
        format: "jpeg",
        width: 200,
        height: 300,
      });
    }
  });

  it("stands a sideways phone photo upright and drops the phone's details", async () => {
    // Taken with the phone on its side: stored 400 wide, with a tag saying "turn 90 degrees"
    const upload = await picture(400, 200)
      .jpeg()
      .withExif({ IFD0: { Make: "TestPhone", Model: "X1" } })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const saved = await sharp((await preparePhoto(upload))!).metadata();

    expect(saved).toMatchObject({ width: 200, height: 400 });
    // No EXIF at all, so no camera model, date, or GPS location
    expect(saved.exif).toBeUndefined();
  });

  it.each([
    // A Windows program starts with MZ, whatever its file name says
    ["a renamed program", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(1000)])],
    // An SVG can carry scripts, and nobody's camera makes one
    [
      "an SVG picture",
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    ],
    ["plain text", Buffer.from("not a picture")],
    ["an empty upload", Buffer.alloc(0)],
  ])("refuses %s", async (_label, upload) => {
    expect(await preparePhoto(upload)).toBeNull();
  });

  it("refuses a JPEG cut off halfway through", async () => {
    const whole = await picture(800, 600).jpeg().toBuffer();

    expect(await preparePhoto(whole.subarray(0, whole.length / 2))).toBeNull();
  });
});

describe("saveMemberPhoto", () => {
  let gym: GymDatabase;
  let localOnly: LocalOnlyDatabase;
  let photosDir: string;
  // What preparePhoto handed back; the bytes don't matter here
  const jpeg = Buffer.from("a prepared JPEG");

  beforeEach(() => {
    ({ db: gym, localOnlyDb: localOnly } = openTestDatabase());
    photosDir = join(mkdtempSync(join(tmpdir(), "jeyos-photos-test-")), "photos");
  });

  afterEach(() => {
    gym.$client.close();
    localOnly.$client.close();
    rmSync(join(photosDir, ".."), { recursive: true, force: true });
  });

  function register(onlineBackup: boolean) {
    const form = registerMemberSchema.parse({
      name: "Ana Cruz",
      phone: "09171234567",
      email: "",
      consentTextVersion: CONSENT_TEXT.version,
      storeOnGymPc: true,
      onlineBackup,
      reminders: false,
    });
    return registerMember(gym, localOnly, form, { accountId: 1, displayName: "Jeyo" }, new Date())
      .id;
  }

  it("saves the photo under a name the server made, in the online-backup folder", async () => {
    const id = register(true);

    expect(await saveMemberPhoto(gym, localOnly, photosDir, id, jpeg)).toBe("saved");

    const [fileName] = readdirSync(join(photosDir, "online-backup"));
    expect(fileName).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(memberPhotoPath(gym, localOnly, photosDir, id)).toBe(
      join(photosDir, "online-backup", fileName!),
    );
    expect(readFileSync(memberPhotoPath(gym, localOnly, photosDir, id)!)).toEqual(jpeg);
    expect(findMember(gym, localOnly, id)?.hasPhoto).toBe(true);
  });

  it("keeps the photo of a member who declined the online backup out of the backed-up folder", async () => {
    const id = register(false);

    await saveMemberPhoto(gym, localOnly, photosDir, id, jpeg);

    expect(readdirSync(photosDir)).toEqual(["local-only"]);
    expect(localOnly.$client.prepare("SELECT photo_file_name FROM member_details").get()).toEqual({
      photo_file_name: expect.stringMatching(/\.jpg$/) as unknown,
    });
  });

  it("refuses a second photo, and a member who doesn't exist", async () => {
    const id = register(true);
    await saveMemberPhoto(gym, localOnly, photosDir, id, jpeg);

    expect(await saveMemberPhoto(gym, localOnly, photosDir, id, jpeg)).toBe("photo_exists");
    expect(await saveMemberPhoto(gym, localOnly, photosDir, 999, jpeg)).toBe("member_not_found");
    expect(readdirSync(join(photosDir, "online-backup"))).toHaveLength(1);
  });

  it("leaves the member without a photo when the disk refuses the file", async () => {
    const id = register(true);
    // A file where the photos folder should be, so the folder can't be made
    writeFileSync(photosDir, "in the way");

    await expect(saveMemberPhoto(gym, localOnly, photosDir, id, jpeg)).rejects.toThrow();
    expect(findMember(gym, localOnly, id)?.hasPhoto).toBe(false);
    expect(memberPhotoPath(gym, localOnly, photosDir, id)).toBeNull();
  });
});
