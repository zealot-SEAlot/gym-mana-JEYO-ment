// The door tablet's page at /door (R42, R51, KTD5, U3 plan step 4). The tablet has no account, so
// this page sits outside the sign-in shell. On load it asks the server whether this browser is a
// paired tablet; if not, it shows a form for the one-time code from the owner's Devices screen.
// Pairing stores the device token in an HttpOnly cookie that only scan routes accept.
import { GYM_NAME, pairDeviceSchema } from "@jeyos/shared";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { api, setCsrfToken } from "../api.ts";
import { errorMessage, fieldErrorsOf, TextField } from "../forms.tsx";
import type { FieldErrors } from "../forms.tsx";

type State = "checking" | "paired" | "unpaired";

export function PairPage() {
  const [state, setState] = useState<State>("checking");
  const [pairingCode, setPairingCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // React runs effects twice in development, so a late answer from the first run is ignored
    let ignore = false;
    // A paired tablet gets back the CSRF token it lost on reload. A revoked or never-paired one
    // gets 401, and a browser signed in as the owner but not paired gets 403; both show the form
    api<{ csrfToken: string }>("/devices/this", { userStarted: true })
      .then((device) => {
        if (!ignore) {
          setCsrfToken(device.csrfToken);
          setState("paired");
        }
      })
      .catch(() => {
        if (!ignore) {
          setState("unpaired");
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = pairDeviceSchema.safeParse({ pairingCode });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/devices/pair", {
        method: "POST",
        body: parsed.data,
        userStarted: true,
      });
      setCsrfToken(csrfToken);
      setState("paired");
    } catch (error) {
      setFormError(
        errorMessage(error, {
          wrong_pairing_code: "That code is wrong. Check it against the owner's Devices screen.",
          pairing_code_expired: "That code has expired. Ask the owner for a new one.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{GYM_NAME}</h1>
      {state === "checking" && <p>Loading…</p>}
      {/* U5 replaces this with the door scan screen */}
      {state === "paired" && <p role="status">This tablet is paired as the door tablet.</p>}
      {state === "unpaired" && (
        <form
          onSubmit={(event) => {
            void pair(event);
          }}
        >
          <h2>Pair this tablet</h2>
          <p>Type the code from the owner's Devices screen.</p>
          {formError !== null && <p role="alert">{formError}</p>}
          <TextField
            label="Pairing code"
            name="pairingCode"
            // Codes are upper case letters and digits; the server ignores case, dashes, and spaces
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={pairingCode}
            onChange={(event) => {
              setPairingCode(event.target.value);
            }}
            errors={fieldErrors.pairingCode}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Pairing…" : "Pair"}
          </button>
        </form>
      )}
    </main>
  );
}
