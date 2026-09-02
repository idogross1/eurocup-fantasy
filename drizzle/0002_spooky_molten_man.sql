PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `trades`;--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fantasy_team_id` integer NOT NULL,
	`matchday_id` integer NOT NULL,
	`out_player_id` integer,
	`in_player_id` integer,
	`credit_delta` real NOT NULL,
	`proj_delta` real NOT NULL,
	`kind` text DEFAULT 'swap' NOT NULL,
	`applied` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`fantasy_team_id`) REFERENCES `fantasy_teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`matchday_id`) REFERENCES `matchdays`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`out_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`in_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
PRAGMA foreign_keys=ON;
