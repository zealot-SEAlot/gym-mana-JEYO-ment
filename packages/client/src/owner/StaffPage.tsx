// The owner's Staff screen (R50, U3 plan step 3): list staff accounts, add one, and for each one
// rename it, disable or enable it, or set a new password. Accounts are never deleted, so a disabled
// account's name still shows on the records it entered. Only the owner reaches this screen, and the
// server refuses these requests from anyone else anyway (R4).
import { addStaffSchema, resetStaffPasswordSchema, updateStaffSchema } from "@jeyos/shared";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../api.ts";
import { errorMessage, fieldErrorsOf, TextField } from "../forms.tsx";
import type { Checked, FieldErrors } from "../forms.tsx";

// One row of GET /api/staff
interface StaffMember {
  id: number;
  displayName: string;
  signInName: string;
  disabled: boolean;
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // What the last change did, such as "Added Lee.", read out by screen readers
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff(await api<StaffMember[]>("/staff", { userStarted: true }));
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // After any change, show what happened and read the list again, so it matches the database
  const changed = useCallback(
    (message: string) => {
      setNotice(message);
      void load();
    },
    [load],
  );

  return (
    <>
      <h1>Staff</h1>
      <p role="status">{notice}</p>
      {loadError !== null && <p role="alert">{loadError}</p>}
      {staff === null ? (
        loadError === null && <p>Loading staff…</p>
      ) : staff.length === 0 ? (
        <p>No staff accounts yet.</p>
      ) : (
        <ul>
          {staff.map((member) => (
            <StaffRow key={member.id} member={member} onChanged={changed} />
          ))}
        </ul>
      )}
      <AddStaffForm onAdded={changed} />
    </>
  );
}

function AddStaffForm({ onAdded }: { onAdded: (message: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [signInName, setSignInName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = addStaffSchema.safeParse({ displayName, signInName, password });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await api("/staff", { method: "POST", body: parsed.data, userStarted: true });
      setDisplayName("");
      setSignInName("");
      setPassword("");
      onAdded(`Added ${parsed.data.displayName}.`);
    } catch (error) {
      // A disabled account's sign-in name counts too, so past records never point at two people
      setFormError(
        errorMessage(error, {
          sign_in_name_taken:
            "Another account already uses this sign-in name, maybe a disabled one. Pick another.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void add(event);
      }}
    >
      <h2>Add a staff account</h2>
      {formError !== null && <p role="alert">{formError}</p>}
      <TextField
        label="Name shown on records"
        name="displayName"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
        }}
        errors={fieldErrors.displayName}
      />
      <TextField
        label="Sign-in name"
        name="signInName"
        autoCapitalize="none"
        autoComplete="off"
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
        // Tells the browser this is a new password, so it doesn't fill in the owner's own
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        errors={fieldErrors.password}
      />
      <button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add staff account"}
      </button>
    </form>
  );
}

function StaffRow({
  member,
  onChanged,
}: {
  member: StaffMember;
  onChanged: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState(member.displayName);
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The three changes share this: check the form, send it, then report or show the error.
  // Returns whether the change was saved
  async function send(
    parsed: Checked,
    path: string,
    method: "PATCH" | "POST",
    message: string,
  ): Promise<boolean> {
    setRowError(null);
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf(parsed.error.issues));
      return false;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      await api(path, { method, body: parsed.data, userStarted: true });
      onChanged(message);
      return true;
    } catch (error) {
      setRowError(
        errorMessage(error, {
          staff_not_found: "This account is gone. Reload the screen.",
        }),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(
      updateStaffSchema.safeParse({ displayName }),
      `/staff/${member.id}`,
      "PATCH",
      `Renamed ${member.displayName} to ${displayName.trim()}. Records entered before keep the old name.`,
    );
  }

  function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(
      resetStaffPasswordSchema.safeParse({ newPassword }),
      `/staff/${member.id}/password`,
      "POST",
      `Set a new password for ${member.displayName}. They are signed out everywhere.`,
    ).then((saved) => {
      // Only once saved, so a password that broke a rule can be fixed instead of typed again
      if (saved) {
        setNewPassword("");
      }
    });
  }

  function toggleDisabled() {
    const disabled = !member.disabled;
    void send(
      updateStaffSchema.safeParse({ disabled }),
      `/staff/${member.id}`,
      "PATCH",
      disabled
        ? `Disabled ${member.displayName}. They are signed out and can't sign in.`
        : `Enabled ${member.displayName}. They can sign in again.`,
    );
  }

  return (
    <li>
      <p>
        <strong>{member.displayName}</strong> · signs in as {member.signInName} ·{" "}
        {member.disabled ? "Disabled" : "Active"}
      </p>
      {rowError !== null && <p role="alert">{rowError}</p>}
      <button type="button" disabled={busy} onClick={toggleDisabled}>
        {member.disabled ? `Enable ${member.displayName}` : `Disable ${member.displayName}`}
      </button>
      {/* Closed until the owner opens it, so a long list stays short on a phone (KTD20) */}
      <details>
        <summary>Rename or set a new password</summary>
        <form onSubmit={rename}>
          <TextField
            label="New name"
            name="displayName"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            errors={fieldErrors.displayName}
          />
          <button type="submit" disabled={busy}>
            Rename
          </button>
        </form>
        <form onSubmit={resetPassword}>
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
            }}
            errors={fieldErrors.newPassword}
          />
          <button type="submit" disabled={busy}>
            Set new password
          </button>
        </form>
      </details>
    </li>
  );
}
