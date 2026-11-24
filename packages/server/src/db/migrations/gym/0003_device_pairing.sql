CREATE TABLE `devices` (
	`id` integer PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`csrf_token` text NOT NULL,
	`paired_at` text NOT NULL,
	`last_scan_at` text,
	`last_scan_address` text,
	CONSTRAINT "devices_token_hash" CHECK(length(token_hash) = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `__new_one_time_codes` (
	`id` integer PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "one_time_codes_purpose" CHECK(purpose IN ('recovery', 'pairing')),
	CONSTRAINT "one_time_codes_code_hash" CHECK(length(code_hash) = 64)
);
--> statement-breakpoint
INSERT INTO `__new_one_time_codes`("id", "purpose", "code_hash", "created_at", "expires_at") SELECT "id", "purpose", "code_hash", "created_at", "expires_at" FROM `one_time_codes`;--> statement-breakpoint
DROP TABLE `one_time_codes`;--> statement-breakpoint
ALTER TABLE `__new_one_time_codes` RENAME TO `one_time_codes`;--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_codes_code_hash_unique` ON `one_time_codes` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_codes_one_recovery` ON `one_time_codes` (`purpose`) WHERE purpose = 'recovery';--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_codes_one_pairing` ON `one_time_codes` (`purpose`) WHERE purpose = 'pairing';