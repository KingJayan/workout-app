CREATE TABLE `google_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`google_user_id` text NOT NULL,
	`email` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`token_expires_at` integer NOT NULL,
	`scopes` text NOT NULL,
	`last_synced_at` integer,
	`sync_error` text,
	`sync_error_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_accounts_user_uidx` ON `google_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `google_calendars` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`google_account_id` integer NOT NULL,
	`calendar_id` text NOT NULL,
	`summary` text,
	`sync_token` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`google_account_id`) REFERENCES `google_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendars_user_cal_uidx` ON `google_calendars` (`user_id`,`calendar_id`);--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `google_calendar_id` text;--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `google_updated_at` text;--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `sync_status` text;--> statement-breakpoint
ALTER TABLE `events_calendar` ADD `affects_training` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uidx` ON `users` (`email`);