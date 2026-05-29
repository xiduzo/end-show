ALTER TABLE `student` ADD COLUMN `is_flagged` INTEGER NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `student` ADD COLUMN `flagged_reason` TEXT NOT NULL DEFAULT '';
