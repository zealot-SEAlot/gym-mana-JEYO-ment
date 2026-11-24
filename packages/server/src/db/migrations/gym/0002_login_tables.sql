CREATE TABLE `one_time_codes` (
	`id` integer PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "one_time_codes_purpose" CHECK(purpose IN ('recovery')),
	CONSTRAINT "one_time_codes_code_hash" CHECK(length(code_hash) = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_codes_code_hash_unique` ON `one_time_codes` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_codes_one_recovery` ON `one_time_codes` (`purpose`) WHERE purpose = 'recovery';--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`failed_attempts` integer NOT NULL,
	`window_started_at` text NOT NULL,
	CONSTRAINT "rate_limits_key_has_kind" CHECK(key GLOB '[a-z]*:?*'),
	CONSTRAINT "rate_limits_failed_attempts" CHECK(failed_attempts > 0)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`csrf_token` text NOT NULL,
	`created_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_token_hash" CHECK(length(token_hash) = 64)
);
