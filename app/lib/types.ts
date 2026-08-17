export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export type Player = { nombre: string; posicion: Position; equipoNFL: string };

export type DraftStatus = "PRE-DRAFT" | "LIVE" | "FINALIZADO";

export type SlotKind = "start" | "flex" | "bench";
export type Slot = { id: string; label: string; positions: Position[] | "ANY"; kind: SlotKind };
export type Team = { id: string; name: string };

export type RosterCounts = { QB: number; RB: number; WR: number; TE: number; K: number; DEF: number; FLEX: number; BENCH: number };

export type LeagueConfig = { budget: number; minimumBid: number; scoring: string; roster: RosterCounts; slots: Slot[] };

export type Purchase = {
  id: string;
  teamId: string;
  slotId: string;
  playerName: string;
  position: Position;
  price: number;
  createdAt: number;
  updatedAt: number;
};

export type EventType =
  | "LEAGUE_CREATED"
  | "LEAGUE_UPDATED"
  | "DRAFT_STARTED"
  | "PLAYER_PURCHASED"
  | "PURCHASE_EDITED"
  | "PURCHASE_UNDONE"
  | "PLAYER_MOVED"
  | "DRAFT_FINALIZED"
  | "DRAFT_REOPENED";

export type LeagueEvent = {
  id: string;
  leagueId: string;
  type: EventType;
  createdAt: number;
  updatedAt: number;
  /** Who made the change. null until accounts/co-managers (Fase 6) exist — every event already carries the field so the Activity Feed and audit trail don't need a reshape later. */
  updatedBy: string | null;
  operationId: string;
  version: number;
  payload: unknown;
};

export type ManagerRole = "co-manager";
export type ManagerAccess = { id: string; role: ManagerRole; label: string; createdAt: number };

export type League = {
  id: string;
  /** Device-local administrator credential. Sent only as a bearer token to protected API routes. */
  adminToken: string;
  schemaVersion: number;
  name: string;
  season: string;
  createdAt: number;
  updatedAt: number;
  status: DraftStatus;
  config: LeagueConfig;
  teams: Team[];
  purchases: Purchase[];
  eventLog: LeagueEvent[];
  /** null = spectator sharing off. A long, unpredictable id — never the league name or a sequential id. */
  spectatorId: string | null;
  /** UI-only flag; the actual PIN hash lives server-side in D1, never in localStorage. */
  spectatorPinEnabled: boolean;
  /** Co-manager access links. Empty = single-admin, fully local/offline (unchanged from Fase 1-5). */
  managers: ManagerAccess[];
  /**
   * Optimistic-concurrency counter, bumped only by the purchase engine (applyPurchase/editPurchase/
   * undoLastPurchase/movePurchase/resetPurchases) and mirrored by the server when a co-manager acts
   * remotely. Deliberately separate from `updatedAt`/the event log's own `version` — this one exists
   * solely so two managers can never both "win" a write to the same league state.
   */
  writeVersion: number;
};

export type AppData = {
  schemaVersion: number;
  appVersion: string;
  lastOpenedLeagueId: string | null;
  dark: boolean;
  sound: boolean;
};

export type PurchaseInput = { teamId: string; playerName: string; price: number; slotId?: string };
export type EngineResult<T> = { ok: true; league: League; result: T } | { ok: false; error: string };

export type LeagueSummary = { id: string; name: string; season: string; status: DraftStatus; updatedAt: number; teams: number; purchases: number; totalSlots: number };
