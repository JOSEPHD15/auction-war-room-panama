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

/**
 * Co-authoritative live state, only used once a league has at least one co-manager. The admin still keeps
 * its own local copy for offline-first browsing/config, but every purchase-mutating write (from the admin
 * or a co-manager) goes through this table with an optimistic-concurrency `writeVersion` check, so two
 * managers can never both "win" a write to the same league.
 */
export const leagueLiveState = sqliteTable("league_live_state", {
  leagueId: text("league_id").primaryKey(),
  payload: text("payload").notNull(),
  writeVersion: integer("write_version").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Reverse lookup so a co-manager link (/liga/co/:token) resolves straight to its league without exposing leagueId in the URL. Mirrors League.managers[] — kept in sync whenever the admin adds/removes a co-manager. */
export const managerAccessTokens = sqliteTable("manager_access_tokens", {
  token: text("token").primaryKey(),
  leagueId: text("league_id").notNull(),
  label: text("label").notNull(),
  createdAt: integer("created_at").notNull(),
});
