CREATE TABLE `spectator_snapshots` (
	`spectator_id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`payload` text NOT NULL,
	`pin_hash` text,
	`updated_at` integer NOT NULL
);
