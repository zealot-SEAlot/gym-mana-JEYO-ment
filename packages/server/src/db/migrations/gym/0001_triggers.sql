-- Triggers, which Drizzle's table definitions can't describe, so this migration is hand-written
-- (drizzle-kit generate --custom), as the schema session decided (block 7). Each trigger runs
-- before the change, and RAISE(ABORT) cancels the whole statement, including the trigger's own work.

-- The audit log is append-only (KTD9). No audit row is ever changed or deleted, not even by an erasure
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
--> statement-breakpoint
-- The clock guard (KTD7, R56). Every table with the shared record columns gets one trigger, so no
-- service can forget it. A record typed in earlier than the latest saved record means the PC's
-- clock went back, such as after a power cut, and would file it under the wrong day. Reads never
-- touch these triggers, so screens still load. confirmClock (clock-guard.ts) resets
-- latest_entered_at to the time the owner confirmed. ISO UTC text sorts like the times it holds
CREATE TRIGGER carried_over_expiries_clock_guard BEFORE INSERT ON carried_over_expiries
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER check_ins_clock_guard BEFORE INSERT ON check_ins
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER consents_clock_guard BEFORE INSERT ON consents
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER day_passes_clock_guard BEFORE INSERT ON day_passes
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER members_clock_guard BEFORE INSERT ON members
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER payments_clock_guard BEFORE INSERT ON payments
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER renewals_clock_guard BEFORE INSERT ON renewals
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER sales_clock_guard BEFORE INSERT ON sales
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
--> statement-breakpoint
CREATE TRIGGER stock_movements_clock_guard BEFORE INSERT ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'clock_behind')
  WHERE NEW.entered_at < (SELECT latest_entered_at FROM system_state WHERE id = 1);
  UPDATE system_state SET latest_entered_at = NEW.entered_at
  WHERE id = 1 AND (latest_entered_at IS NULL OR latest_entered_at < NEW.entered_at);
END;
