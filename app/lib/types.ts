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
  operationId: string;
  version: number;
  payload: unknown;
};

export type League = {
  id: string;
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
};

export type AppData = {
  schemaVersion: number;
  appVersion: string;
  lastOpenedLeagueId: string | null;
  dark: boolean;
};

export type PurchaseInput = { teamId: string; playerName: string; price: number; slotId?: string };
export type EngineResult<T> = { ok: true; league: League; result: T } | { ok: false; error: string };

export type LeagueSummary = { id: string; name: string; season: string; status: DraftStatus; updatedAt: number; teams: number };
