// Pieces every form uses: a labelled text field that shows its own error messages, and the step that
// groups a shared schema's complaints by field. Sign-in, setup, staff, and pairing forms all use them.
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

import { ApiError } from "./api.ts";

/**
 * The sentence to show for a failed request. words gives this screen's sentences for the server's
 * error codes it expects, such as { sign_in_name_taken: "..." }; anything else gets a general one.
 */
export function errorMessage(error: unknown, words: Partial<Record<string, string>> = {}): string {
  if (error instanceof ApiError) {
    const sentence = words[error.code];
    if (sentence !== undefined) {
      return sentence;
    }
    // Sign-in names, recovery codes, and pairing codes all lock for a while after five wrong tries
    if (error.code === "too_many_tries") {
      const minutes = Math.ceil((error.retryAfterSeconds ?? 60) / 60);
      return `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    if (error.code === "server_unreachable") {
      return "Can't reach the gym PC. Check that it is on and that this device is on the gym Wi-Fi.";
    }
  }
  return "Something went wrong. Try again.";
}

/**
 * Each field's messages, keyed by field name. The server's "invalid_request" details use the same
 * shape ({ fields: FieldErrors }), so a screen can show either one the same way.
 */
export type FieldErrors = Partial<Record<string, string[]>>;

// What a shared schema's safeParse says about one complaint
type Issue = { path: readonly PropertyKey[]; message: string };

/** Any shared schema's safeParse result, whichever form it checked. */
export type Checked =
  { success: true; data: unknown } | { success: false; error: { issues: readonly Issue[] } };

/** Groups a failed safeParse's issues by the field each one names. */
export function fieldErrorsOf(issues: readonly Issue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    (errors[String(path[0])] ??= []).push(message);
  }
  return errors;
}

/**
 * A text input with its label and its error messages. The label wraps the input, so a screen
 * reader reads the label, and tests find the input by it. aria-describedby makes the screen reader
 * read the error too.
 */
export function TextField({
  label,
  errors = [],
  ...input
}: { label: string; errors?: string[] | undefined } & InputHTMLAttributes<HTMLInputElement>) {
  const errorId = useId();
  const hasErrors = errors.length > 0;
  return (
    <div className="field">
      <label>
        {label}
        <input
          {...input}
          aria-invalid={hasErrors}
          aria-describedby={hasErrors ? errorId : undefined}
        />
      </label>
      {hasErrors && (
        <p id={errorId} className="field-error">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
