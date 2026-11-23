CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`sign_in_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_hash_method` text NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	CONSTRAINT "accounts_role" CHECK(role IN ('owner', 'staff')),
	CONSTRAINT "accounts_password_hash_method" CHECK(password_hash_method IN ('argon2id', 'bcrypt'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_sign_in_name` ON `accounts` (lower(sign_in_name));--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_one_owner` ON `accounts` (`role`) WHERE role = 'owner';--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` integer,
	`action` text NOT NULL,
	`account_id` integer NOT NULL,
	`account_name` text NOT NULL,
	`acted_at` text NOT NULL,
	`record_manila_date` text NOT NULL,
	`reason` text,
	`before_json` text,
	`after_json` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_log_action" CHECK(action IN ('void', 'correct', 'override', 'carry_over', 'back_entry', 'back_entry_refused', 'member_edit', 'erase')),
	CONSTRAINT "audit_log_row_unless_refused" CHECK((action = 'back_entry_refused' AND row_id IS NULL) OR (action <> 'back_entry_refused' AND row_id IS NOT NULL)),
	CONSTRAINT "audit_log_before_json" CHECK(json_valid(before_json)),
	CONSTRAINT "audit_log_after_json" CHECK(json_valid(after_json))
);
--> statement-breakpoint
CREATE TABLE `audit_personal_values` (
	`id` integer PRIMARY KEY NOT NULL,
	`audit_log_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`field` text NOT NULL,
	`before` text,
	`after` text,
	`redacted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`audit_log_id`) REFERENCES `audit_log`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "audit_personal_values_redacted_blank" CHECK(redacted = 0 OR (before IS NULL AND after IS NULL))
);
--> statement-breakpoint
CREATE TABLE `check_ins` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer,
	`entered_by_name` text,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`member_id` integer,
	`day_pass_id` integer,
	`door_event_id` integer,
	`overridden_rejection_id` integer,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`day_pass_id`) REFERENCES `day_passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`door_event_id`) REFERENCES `door_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`overridden_rejection_id`) REFERENCES `rejections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "check_ins_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "check_ins_kind" CHECK(kind IN ('scan_using', 'override')),
	CONSTRAINT "check_ins_source" CHECK(source IN ('door', 'desk')),
	CONSTRAINT "check_ins_member_or_pass" CHECK((member_id IS NOT NULL AND day_pass_id IS NULL) OR (member_id IS NULL AND day_pass_id IS NOT NULL)),
	CONSTRAINT "check_ins_door_or_desk" CHECK((source = 'door' AND kind = 'scan_using' AND door_event_id IS NOT NULL AND entered_by_account_id IS NULL AND entered_by_name IS NULL) OR (source = 'desk' AND door_event_id IS NULL AND entered_by_account_id IS NOT NULL AND entered_by_name IS NOT NULL)),
	CONSTRAINT "check_ins_pass_desk_is_readmission" CHECK(day_pass_id IS NULL OR source = 'door' OR kind = 'override'),
	CONSTRAINT "check_ins_rejection_only_on_override" CHECK(overridden_rejection_id IS NULL OR kind = 'override')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_door_event_id_unique` ON `check_ins` (`door_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_member_once_per_day` ON `check_ins` (`member_id`,`manila_date`) WHERE kind = 'scan_using' AND voided = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_pass_once` ON `check_ins` (`day_pass_id`) WHERE kind = 'scan_using' AND voided = 0;--> statement-breakpoint
CREATE TABLE `door_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rejections` (
	`id` integer PRIMARY KEY NOT NULL,
	`door_event_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`reason` text NOT NULL,
	`scanned_value` text,
	`member_id` integer,
	`day_pass_id` integer,
	FOREIGN KEY (`door_event_id`) REFERENCES `door_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`day_pass_id`) REFERENCES `day_passes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rejections_scanned_value_length" CHECK(length(scanned_value) <= 12),
	CONSTRAINT "rejections_reason_matches_scan" CHECK((reason = 'invalid_code' AND member_id IS NULL AND day_pass_id IS NULL) OR (reason IN ('expired', 'already_used_today') AND member_id IS NOT NULL AND day_pass_id IS NULL) OR (reason = 'pass_not_valid' AND member_id IS NULL AND day_pass_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rejections_door_event_id_unique` ON `rejections` (`door_event_id`);--> statement-breakpoint
CREATE TABLE `member_details` (
	`member_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`photo_file_name` text
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` integer PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`consent_text_version` text NOT NULL,
	`store_on_gym_pc` integer NOT NULL,
	`online_backup` integer NOT NULL,
	`reminders` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "consents_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "consents_store_on_gym_pc" CHECK(store_on_gym_pc = 1),
	CONSTRAINT "consents_reminders_need_backup" CHECK(reminders = 0 OR online_backup = 1)
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`code` text,
	`erased` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "members_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "members_code_until_erased" CHECK((erased = 0 AND code IS NOT NULL) OR (erased = 1 AND code IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_code_unique` ON `members` (`code`);--> statement-breakpoint
CREATE TABLE `carried_over_expiries` (
	`id` integer PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`expires_on` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "carried_over_expiries_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carried_over_expiries_one_per_member` ON `carried_over_expiries` (`member_id`) WHERE voided = 0;--> statement-breakpoint
CREATE TABLE `renewals` (
	`id` integer PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`plan_id` integer NOT NULL,
	`plan_length` integer NOT NULL,
	`plan_length_unit` text NOT NULL,
	`plan_price_centavos` integer NOT NULL,
	`payment_id` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "renewals_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "renewals_plan_length" CHECK(plan_length > 0),
	CONSTRAINT "renewals_plan_length_unit" CHECK(plan_length_unit IN ('day', 'month')),
	CONSTRAINT "renewals_plan_price" CHECK(plan_price_centavos >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `renewals_payment_id_unique` ON `renewals` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`kind` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	`method` text NOT NULL,
	`reference_number` text,
	`reference_number_key` text GENERATED ALWAYS AS (lower(replace(reference_number, ' ', ''))) VIRTUAL,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "payments_amount" CHECK(amount_centavos > 0),
	CONSTRAINT "payments_kind" CHECK(kind IN ('membership', 'day_pass', 'sale')),
	CONSTRAINT "payments_method" CHECK(method IN ('cash', 'gcash', 'maya')),
	CONSTRAINT "payments_reference_for_e_wallet" CHECK((method = 'cash' AND reference_number IS NULL) OR (method IN ('gcash', 'maya') AND reference_number IS NOT NULL AND replace(reference_number, ' ', '') <> ''))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_reference_number` ON `payments` (`reference_number_key`) WHERE voided = 0;--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_centavos` integer NOT NULL,
	`length` integer NOT NULL,
	`length_unit` text NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	CONSTRAINT "plans_price" CHECK(price_centavos >= 0),
	CONSTRAINT "plans_length" CHECK(length > 0),
	CONSTRAINT "plans_length_unit" CHECK(length_unit IN ('day', 'month'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_active_name` ON `plans` (lower(name)) WHERE retired = 0;--> statement-breakpoint
CREATE TABLE `add_ons` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_centavos` integer NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	CONSTRAINT "add_ons_price" CHECK(price_centavos >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `add_ons_active_name` ON `add_ons` (lower(name)) WHERE retired = 0;--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`price_centavos` integer NOT NULL,
	`stock_count` integer,
	`low_stock_level` integer,
	`takes_add_ons` integer DEFAULT false NOT NULL,
	`needs_member` integer DEFAULT false NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	CONSTRAINT "products_kind" CHECK(kind IN ('sealed', 'menu')),
	CONSTRAINT "products_price" CHECK(price_centavos >= 0),
	CONSTRAINT "products_low_stock_level" CHECK(low_stock_level >= 0),
	CONSTRAINT "products_sealed_or_menu" CHECK((kind = 'sealed' AND stock_count IS NOT NULL AND low_stock_level IS NOT NULL AND takes_add_ons = 0 AND needs_member = 0) OR (kind = 'menu' AND stock_count IS NULL AND low_stock_level IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_active_name` ON `products` (lower(name)) WHERE retired = 0;--> statement-breakpoint
CREATE TABLE `sale_line_add_ons` (
	`id` integer PRIMARY KEY NOT NULL,
	`sale_line_id` integer NOT NULL,
	`add_on_id` integer NOT NULL,
	`price_centavos` integer NOT NULL,
	FOREIGN KEY (`sale_line_id`) REFERENCES `sale_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`add_on_id`) REFERENCES `add_ons`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_line_add_ons_price" CHECK(price_centavos >= 0)
);
--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`id` integer PRIMARY KEY NOT NULL,
	`sale_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_centavos` integer NOT NULL,
	`member_id` integer,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_lines_quantity" CHECK(quantity > 0),
	CONSTRAINT "sale_lines_unit_price" CHECK(unit_price_centavos >= 0)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`payment_id` integer NOT NULL,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_payment_id_unique` ON `sales` (`payment_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by_account_id` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`updated_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "settings_key_has_module" CHECK(key GLOB '[a-z]*.[a-zA-Z]*'),
	CONSTRAINT "settings_value_json" CHECK(json_valid(value))
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`product_id` integer NOT NULL,
	`kind` text NOT NULL,
	`quantity_change` integer NOT NULL,
	`sale_line_id` integer,
	`voids_movement_id` integer,
	`correction_reason` text,
	`amount_paid_centavos` integer,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_line_id`) REFERENCES `sale_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voids_movement_id`) REFERENCES `stock_movements`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage')),
	CONSTRAINT "stock_movements_never_voided" CHECK(voided = 0),
	CONSTRAINT "stock_movements_kind" CHECK(kind IN ('restock', 'sale', 'void', 'correction')),
	CONSTRAINT "stock_movements_correction_reason" CHECK(correction_reason IN ('breakage', 'spoiled', 'miscount', 'other')),
	CONSTRAINT "stock_movements_quantity" CHECK(quantity_change <> 0),
	CONSTRAINT "stock_movements_amount_paid" CHECK(amount_paid_centavos >= 0),
	CONSTRAINT "stock_movements_kind_shape" CHECK((kind = 'restock' AND quantity_change > 0 AND sale_line_id IS NULL AND voids_movement_id IS NULL AND correction_reason IS NULL) OR (kind = 'sale' AND quantity_change < 0 AND sale_line_id IS NOT NULL AND voids_movement_id IS NULL AND correction_reason IS NULL AND amount_paid_centavos IS NULL) OR (kind = 'void' AND sale_line_id IS NULL AND voids_movement_id IS NOT NULL AND correction_reason IS NULL AND amount_paid_centavos IS NULL) OR (kind = 'correction' AND sale_line_id IS NULL AND voids_movement_id IS NULL AND correction_reason IS NOT NULL AND amount_paid_centavos IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_sale_line_id_unique` ON `stock_movements` (`sale_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_voids_movement_id_unique` ON `stock_movements` (`voids_movement_id`);--> statement-breakpoint
CREATE TABLE `system_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`latest_entered_at` text,
	`clock_confirmed_at` text,
	`clock_confirmed_by_account_id` integer,
	FOREIGN KEY (`clock_confirmed_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "system_state_one_row" CHECK(id = 1),
	CONSTRAINT "system_state_confirmed_together" CHECK((clock_confirmed_at IS NULL) = (clock_confirmed_by_account_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE `day_passes` (
	`id` integer PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`entered_at` text NOT NULL,
	`manila_date` text NOT NULL,
	`entry_mode` text NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`entered_by_account_id` integer NOT NULL,
	`entered_by_name` text NOT NULL,
	`token` text NOT NULL,
	`payment_id` integer NOT NULL,
	FOREIGN KEY (`entered_by_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "day_passes_entry_mode" CHECK(entry_mode IN ('normal', 'after_outage'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_passes_token_unique` ON `day_passes` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `day_passes_payment_id_unique` ON `day_passes` (`payment_id`);--> statement-breakpoint
-- Added by hand: the one system_state row the clock guard reads (schema session, block 2).
-- The migrations test fails if a regenerated migration loses it.
INSERT INTO `system_state` (`id`) VALUES (1);
