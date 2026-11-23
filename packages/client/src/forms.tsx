// Pieces every form uses: a labelled text field that shows its own error messages, and the step that
// groups a shared schema's complaints by field. Sign-in, setup, staff, and pairing forms all use them.
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

/**
 * Each field's messages, keyed by field name. The server's "invalid_request" details use the same
 * shape ({ fields: FieldErrors }), so a screen can show either one the same way.
 */
export type FieldErrors = Partial<Record<string, string[]>>;

/** Groups a failed safeParse's issues by the field each one names. */
export function fieldErrorsOf(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FieldErrors {
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
