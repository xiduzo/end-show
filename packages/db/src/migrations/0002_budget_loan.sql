DROP TABLE IF EXISTS `budget_transfer`;--> statement-breakpoint
CREATE TABLE `budget_loan` (
	`id` text PRIMARY KEY NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`responded_at` integer,
	`returned_at` integer,
	FOREIGN KEY (`from_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `budget_loan_from_idx` ON `budget_loan` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `budget_loan_to_idx` ON `budget_loan` (`to_user_id`);--> statement-breakpoint
CREATE INDEX `budget_loan_status_idx` ON `budget_loan` (`status`);
