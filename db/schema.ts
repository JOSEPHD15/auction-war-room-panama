import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Read-only spectator snapshots. The admin's browser is always the source of
 * truth (localStorage); this table only mirrors what a spectator link is
 * allowed to see, so it never becomes an authority for the draft itself.
 */
export const spectatorSnapshots = sqliteTable("spectator_snapshots", {
  spectatorId: text("spectator_id").primaryKey(),
  leagueId: text("league_id").notNull(),
  payload: text("payload").notNull(),
  pinHash: text("pin_hash"),
  updatedAt: integer("updated_at").notNull(),
});
