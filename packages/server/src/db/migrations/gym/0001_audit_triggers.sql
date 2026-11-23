-- The audit log is append-only (KTD9). Drizzle's table definitions can't describe triggers, so
-- this migration is hand-written (drizzle-kit generate --custom), as the schema session decided
-- (block 7). Each trigger runs before the change and RAISE(ABORT) cancels the whole statement.

-- No audit row is ever changed or deleted, not even by an erasure
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log rows cannot be changed');
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log rows cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER audit_personal_values_no_delete BEFORE DELETE ON audit_personal_values
BEGIN
  SELECT RAISE(ABORT, 'audit_personal_values rows cannot be deleted');
END;
--> statement-breakpoint
-- The one exception (R62): an erasure may blank a value and mark it redacted, and change nothing
-- else. erasure_in_progress() is a function the server adds to each connection (db/client.ts).
-- It returns 1 only inside a transaction the erasure service started. A tool that opens the file
-- without the server has no such function, so its update fails too
CREATE TRIGGER audit_personal_values_only_redact BEFORE UPDATE ON audit_personal_values
WHEN NOT (
  erasure_in_progress() = 1
  AND NEW.redacted = 1
  AND NEW.before IS NULL
  AND NEW.after IS NULL
  AND NEW.id = OLD.id
  AND NEW.audit_log_id = OLD.audit_log_id
  AND NEW.member_id = OLD.member_id
  AND NEW.field = OLD.field
)
BEGIN
  SELECT RAISE(ABORT, 'audit_personal_values rows can only be redacted by an erasure');
END;
