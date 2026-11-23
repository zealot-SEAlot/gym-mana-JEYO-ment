// Owner setup on a fresh install, and the owner's forgotten-password reset (R49, KTD5, U3 plan
// step 1). Both work only in a browser on the gym PC itself: the server refuses them from any other
// device. Each one ends by showing a recovery code once, for the owner to print.
import { GYM_NAME, recoverySchema, setupSchema } from "@jeyos/shared";
import { useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api.ts";
import { errorMessage, fieldErrorsOf, TextField } from "../forms.tsx";
import type { Checked, FieldErrors } from "../forms.tsx";

// What both pages say for the server's refusals they share
const NOT_ON_GYM_PC =
  "This works only on the gym PC itself. Open https://localhost/ in a browser on the gym PC.";

/**
 * The parts both forms share: field values, errors, the busy flag, and sending. send checks the
 * form, posts it to path, and keeps the recovery code the server answers with.
 */
function useCodeForm<Fields extends Record<string, string>>(empty: Fields) {
  const [fields, setFields] = useState(empty);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function send(parsed: Checked, path: string, words: Record<string, string>) {
    setFormError(null);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const answer = await api<{ recoveryCode: string }>(path, {
        method: "POST",
        body: parsed.data,
        userStarted: true,
      });
      setRecoveryCode(answer.recoveryCode);
    } catch (error) {
      setFormError(errorMessage(error, { not_on_gym_pc: NOT_ON_GYM_PC, ...words }));
    } finally {
      setBusy(false);
    }
  }

  // Props for a TextField bound to one field
  function field(name: keyof Fields & string) {
    return {
      name,
      value: fields[name],
      onChange: (event: { target: { value: string } }) => {
        setFields({ ...fields, [name]: event.target.value });
      },
      errors: fieldErrors[name],
    };
  }

  return { fields, field, send, busy, formError, recoveryCode };
}

/** Shown once after setup or a reset: the only time the server ever gives out this code. */
function RecoveryCodeNotice({ code, before }: { code: string; before: string }) {
  return (
    <>
      <p role="status">{before}</p>
      <p>
        Print this recovery code and keep it somewhere safe, away from the gym PC. If you forget the
        owner password, it sets a new one, once. It is not shown again.
      </p>
      <p className="pairing-code">{code}</p>
      <p>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Print
        </button>{" "}
        <a href="/">Go to sign-in</a>
      </p>
    </>
  );
}

export function SetupPage() {
  const form = useCodeForm({ setupSecret: "", displayName: "", signInName: "", password: "" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.send(setupSchema.safeParse(form.fields), "/setup", {
      setup_done: "The owner account already exists. Sign in instead.",
      setup_secret_wrong:
        "That setup secret is wrong. Copy it again from setup-secret.txt in the gym data folder.",
      setup_secret_missing:
        "The gym PC has no setup secret yet. Run the install script on the gym PC first.",
    });
  }

  return (
    <main>
      <h1>{GYM_NAME}</h1>
      {form.recoveryCode !== null ? (
        <RecoveryCodeNotice code={form.recoveryCode} before="The owner account is ready." />
      ) : (
        <form onSubmit={submit}>
          <h2>Set up the owner account</h2>
          <p>
            This makes the one owner account. The install script wrote the setup secret to
            setup-secret.txt in the gym data folder.
          </p>
          {form.formError !== null && <p role="alert">{form.formError}</p>}
          <TextField
            label="Setup secret"
            autoComplete="off"
            spellCheck={false}
            {...form.field("setupSecret")}
          />
          <TextField label="Owner's name shown on records" {...form.field("displayName")} />
          <TextField
            label="Sign-in name"
            autoCapitalize="none"
            autoComplete="username"
            {...form.field("signInName")}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            {...form.field("password")}
          />
          <button type="submit" disabled={form.busy}>
            {form.busy ? "Setting up…" : "Set up"}
          </button>
        </form>
      )}
    </main>
  );
}

export function RecoveryPage() {
  const form = useCodeForm({ recoveryCode: "", newPassword: "" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.send(recoverySchema.safeParse(form.fields), "/setup/recover", {
      wrong_recovery_code: "That recovery code is wrong. Check it against the printed copy.",
      recovery_code_expired:
        "That recovery code has expired, so it can't set a new password anymore.",
    });
  }

  return (
    <main>
      <h1>{GYM_NAME}</h1>
      {form.recoveryCode !== null ? (
        <RecoveryCodeNotice
          code={form.recoveryCode}
          before="The owner password is changed, and every owner sign-in has ended. The old recovery code no longer works."
        />
      ) : (
        <form onSubmit={submit}>
          <h2>Forgot the owner password</h2>
          <p>Type the printed recovery code and a new password. Each code works once.</p>
          {form.formError !== null && <p role="alert">{form.formError}</p>}
          <TextField
            label="Recovery code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            {...form.field("recoveryCode")}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            {...form.field("newPassword")}
          />
          <button type="submit" disabled={form.busy}>
            {form.busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </main>
  );
}
