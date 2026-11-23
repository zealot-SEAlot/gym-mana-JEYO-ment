// The sign-in screen for the owner and staff (R3, KTD5). It checks the form with the same schema the
// server uses, then sends it to POST /api/auth/sign-in. The session itself travels in an HttpOnly
// cookie the page can't read; the page keeps only the CSRF token and who signed in.
import { GYM_NAME, signInSchema } from "@jeyos/shared";
import type { AccountRole } from "@jeyos/shared";
import { useState } from "react";
import type { FormEvent } from "react";

import { api, setCsrfToken } from "../api.ts";
import { errorMessage, fieldErrorsOf, TextField } from "../forms.tsx";
import type { FieldErrors } from "../forms.tsx";

/** Who is signed in on this page: what the shell needs to pick the owner or staff screens. */
export interface SignedIn {
  displayName: string;
  role: AccountRole;
}

export function LoginPage({ onSignedIn }: { onSignedIn: (signedIn: SignedIn) => void }) {
  const [signInName, setSignInName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // True while the request is out, so a double tap can't send the form twice
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    // Stops the browser's own form submit, which would reload the page
    event.preventDefault();
    setFormError(null);
    const parsed = signInSchema.safeParse({ signInName, password });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const answer = await api<SignedIn & { csrfToken: string }>("/auth/sign-in", {
        method: "POST",
        body: parsed.data,
        userStarted: true,
      });
      setCsrfToken(answer.csrfToken);
      onSignedIn({ displayName: answer.displayName, role: answer.role });
    } catch (error) {
      // The server gives one answer for a wrong name, a wrong password, and a disabled account
      // (R50), so the screen can't say which one it was either
      setFormError(errorMessage(error, { wrong_sign_in: "Wrong sign-in name or password." }));
      // The sign-in name stays so a typo in the password is quick to retry
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{GYM_NAME}</h1>
      <form
        onSubmit={(event) => {
          void signIn(event);
        }}
      >
        <h2>Sign in</h2>
        {formError !== null && <p role="alert">{formError}</p>}
        <TextField
          label="Sign-in name"
          name="signInName"
          autoComplete="username"
          // Phones would otherwise capitalize the first letter; names ignore case anyway
          autoCapitalize="none"
          value={signInName}
          onChange={(event) => {
            setSignInName(event.target.value);
          }}
          errors={fieldErrors.signInName}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          errors={fieldErrors.password}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
