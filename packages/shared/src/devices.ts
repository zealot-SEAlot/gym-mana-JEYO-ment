// The door tablet's pairing form (R51, KTD5), shared so the pairing screen and the server agree.
import { z } from "zod";

export const pairDeviceSchema = z.object({
  // The code the owner's screen shows. Dashes, spaces, and lower case don't matter
  pairingCode: z.string().trim().min(1, "Enter the pairing code").max(100),
});
