ALTER TABLE `student` ADD COLUMN `flagged_by` TEXT REFERENCES `user`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `student` ADD COLUMN `review_request` TEXT NOT NULL DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `student` ADD COLUMN `review_message` TEXT NOT NULL DEFAULT '';
