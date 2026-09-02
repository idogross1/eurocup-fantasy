CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	`ok` integer DEFAULT false NOT NULL,
	`summary` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `synced_roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dunkest_team_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`slot` text,
	`is_captain` integer DEFAULT false NOT NULL,
	`formation_id` integer,
	`synced_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`dunkest_team_id`) REFERENCES `synced_teams`(`dunkest_team_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `synced_roster_team_matchday_player_idx` ON `synced_roster_entries` (`dunkest_team_id`,`matchday_id`,`player_id`);--> statement-breakpoint
CREATE TABLE `synced_teams` (
	`dunkest_team_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mapped_fantasy_team_id` integer,
	`pts` real,
	`total_pts` real,
	`position` integer,
	`synced_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`mapped_fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action
);
