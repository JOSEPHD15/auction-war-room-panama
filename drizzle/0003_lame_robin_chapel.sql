ALTER TABLE `league_live_state` ADD `admin_token_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `spectator_snapshots` ADD `admin_token_hash` text DEFAULT '' NOT NULL;
