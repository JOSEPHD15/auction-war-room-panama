CREATE TABLE `manager_access_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL
);
