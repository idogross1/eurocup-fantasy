CREATE TABLE `fantasy_teams` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`strategy` text NOT NULL,
	`risk_k` real DEFAULT 0 NOT NULL,
	`budget` real DEFAULT 100 NOT NULL,
	`dunkest_team_id` integer
);
--> statement-breakpoint
CREATE TABLE `matchdays` (
	`id` integer PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`label` text NOT NULL,
	`is_current` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `player_flags` (
	`player_id` integer PRIMARY KEY NOT NULL,
	`lock` integer DEFAULT false NOT NULL,
	`exclude` integer DEFAULT false NOT NULL,
	`boost_pct` real DEFAULT 0 NOT NULL,
	`injury_override` text,
	`note` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`quotation` real NOT NULL,
	`avg_pts` real DEFAULT 0 NOT NULL,
	`popularity` real DEFAULT 0 NOT NULL,
	`is_injured` integer DEFAULT false NOT NULL,
	`probability_of_playing` real DEFAULT 1 NOT NULL,
	`opponent_abbr` text,
	`round_number` integer,
	`started_from_bench` integer,
	`label` text,
	`source` text DEFAULT 'csv' NOT NULL,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_snapshots_player_matchday_idx` ON `player_snapshots` (`player_id`,`matchday_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`position` text NOT NULL,
	`real_team_abbr` text NOT NULL,
	FOREIGN KEY (`real_team_abbr`) REFERENCES `real_teams`(`abbr`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `players_position_idx` ON `players` (`position`);--> statement-breakpoint
CREATE INDEX `players_team_idx` ON `players` (`real_team_abbr`);--> statement-breakpoint
CREATE TABLE `projections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`mean` real NOT NULL,
	`floor` real NOT NULL,
	`ceiling` real NOT NULL,
	`sigma` real NOT NULL,
	`model` text NOT NULL,
	`computed_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projections_player_matchday_idx` ON `projections` (`player_id`,`matchday_id`);--> statement-breakpoint
CREATE TABLE `real_teams` (
	`abbr` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roster_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fantasy_team_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`slot` text NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`formation_id` integer,
	`source` text DEFAULT 'optimizer' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `roster_entries_team_matchday_idx` ON `roster_entries` (`fantasy_team_id`,`matchday_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fantasy_team_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`out_player_id` integer NOT NULL,
	`in_player_id` integer NOT NULL,
	`credit_delta` real NOT NULL,
	`proj_delta` real NOT NULL,
	`applied` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`out_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`in_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
