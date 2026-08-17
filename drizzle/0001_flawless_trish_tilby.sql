CREATE TABLE `league_live_state` (
	`league_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`write_version` integer NOT NULL,
	`updated_at` integer NOT NULL
);
