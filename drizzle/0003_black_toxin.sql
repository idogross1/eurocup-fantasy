CREATE TABLE `team_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dunkest_team_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`matchday_number` integer NOT NULL,
	`global_position` integer,
	`matchday_pts` real,
	`total_pts` real,
	`roster_value` real,
	`roster_size` integer,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`dunkest_team_id`) REFERENCES `synced_teams`(`dunkest_team_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_history_team_matchday_idx` ON `team_history` (`dunkest_team_id`,`matchday_id`);