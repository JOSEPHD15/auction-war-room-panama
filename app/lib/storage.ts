import { buildSlots, DEFAULT_BUDGET, DEFAULT_MINIMUM_BID, DEFAULT_ROSTER, DEFAULT_SCORING } from "./formulas";
import { makeId } from "./ids";
import type { AppData, League, LeagueEvent, LeagueSummary, Position, Purchase } from "./types";

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "2.0.0";

const APP_KEY = "awr:app";
const LEAGUE_PREFIX = "awr:league:";
const LEGACY_KEY = "auction-war-room-v1";

function isValidLeagueShape(value: unknown): value is League {
  if (!value || typeof value !== "object") return false;
  const league = value as League;
  return typeof league.id === "string" && Array.isArray(league.teams) && Array.isArray(league.purchases) && Array.isArray(league.eventLog) && !!league.config && Array.isArray(league.config.slots);
}

/** Backfills fields added after a league was first saved, so older saved leagues keep working without a hard schema migration. */
function normalizeLeague(league: League): League {
  const needsScoring = typeof league.config.scoring !== "string";
  const needsSpectatorFields = typeof league.spectatorId === "undefined" || typeof league.spectatorPinEnabled === "undefined";
  if (!needsScoring && !needsSpectatorFields) return league;
  return {
    ...league,
    config: needsScoring ? { ...league.config, scoring: DEFAULT_SCORING } : league.config,
    spectatorId: typeof league.spectatorId === "undefined" ? null : league.spectatorId,
    spectatorPinEnabled: typeof league.spectatorPinEnabled === "undefined" ? false : league.spectatorPinEnabled,
  };
}

export function loadAppData(): AppData | null {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== "object" || data === null) return null;
    return { schemaVersion: Number(data.schemaVersion) || SCHEMA_VERSION, appVersion: data.appVersion || APP_VERSION, lastOpenedLeagueId: data.lastOpenedLeagueId ?? null, dark: typeof data.dark === "boolean" ? data.dark : true, sound: typeof data.sound === "boolean" ? data.sound : true };
  } catch {
    return null;
  }
}

export function getOrInitAppData(): AppData {
  return loadAppData() ?? { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, lastOpenedLeagueId: null, dark: true, sound: true };
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(APP_KEY, JSON.stringify(data));
}

export function loadLeague(id: string): League | null {
  try {
    const raw = localStorage.getItem(LEAGUE_PREFIX + id);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isValidLeagueShape(data) ? normalizeLeague(data) : null;
  } catch {
    return null;
  }
}

export function saveLeague(league: League): League {
  const stamped: League = { ...league, updatedAt: Date.now() };
  localStorage.setItem(LEAGUE_PREFIX + stamped.id, JSON.stringify(stamped));
  return stamped;
}

export function deleteLeague(id: string): void {
  localStorage.removeItem(LEAGUE_PREFIX + id);
  const app = loadAppData();
  if (app && app.lastOpenedLeagueId === id) saveAppData({ ...app, lastOpenedLeagueId: null });
}

export function listLeagueSummaries(): LeagueSummary[] {
  const summaries: LeagueSummary[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(LEAGUE_PREFIX)) continue;
    try {
      const league = JSON.parse(localStorage.getItem(key) || "");
      if (!isValidLeagueShape(league)) continue;
      summaries.push({ id: league.id, name: league.name, season: league.season, status: league.status, updatedAt: league.updatedAt, teams: league.teams.length });
    } catch {
      // skip corrupt entry, never throw
    }
  }
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

type LegacyPick = { jugador: string; posicion: string; precio: string; objetivo: string };
type LegacyHistoryEntry = { team: string; slot: string; jugador: string; precio: string; posicion: string; updatedAt: number; slotIndex: number };
type LegacyData = { teams?: string[]; board?: Record<string, LegacyPick[]>; purchaseHistory?: LegacyHistoryEntry[]; dark?: boolean };

function buildLeagueFromLegacy(legacy: LegacyData): League {
  const leagueId = makeId("league");
  const now = Date.now();
  const slots = buildSlots(DEFAULT_ROSTER);
  const teamNames = Array.isArray(legacy.teams) && legacy.teams.length ? legacy.teams : ["Equipo 1"];
  const teams = teamNames.map((name) => ({ id: makeId("team"), name }));
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]));
  const board = legacy.board || {};

  const purchases: Purchase[] = [];
  const seenKeys = new Set<string>();

  const history = Array.isArray(legacy.purchaseHistory) ? [...legacy.purchaseHistory].reverse() : [];
  for (const entry of history) {
    const key = `${entry.team}#${entry.slotIndex}`;
    if (seenKeys.has(key)) continue;
    const teamId = teamIdByName.get(entry.team);
    const slot = slots[entry.slotIndex];
    if (!teamId || !slot || !entry.jugador?.trim()) continue;
    seenKeys.add(key);
    const createdAt = Number(entry.updatedAt) || now;
    purchases.push({ id: makeId("purchase"), teamId, slotId: slot.id, playerName: entry.jugador.trim(), position: (entry.posicion || "RB") as Position, price: Number(entry.precio) || 0, createdAt, updatedAt: createdAt });
  }

  teamNames.forEach((teamName) => {
    const teamId = teamIdByName.get(teamName);
    if (!teamId) return;
    (board[teamName] || []).forEach((pick, slotIndex) => {
      const key = `${teamName}#${slotIndex}`;
      if (seenKeys.has(key) || !pick?.jugador?.trim()) return;
      const slot = slots[slotIndex];
      if (!slot) return;
      seenKeys.add(key);
      purchases.push({ id: makeId("purchase"), teamId, slotId: slot.id, playerName: pick.jugador.trim(), position: (pick.posicion || "RB") as Position, price: Number(pick.precio) || 0, createdAt: now, updatedAt: now });
    });
  });

  purchases.sort((a, b) => a.createdAt - b.createdAt);

  const createdAt = purchases[0]?.createdAt ?? now;
  const eventLog: LeagueEvent[] = [{ id: makeId("event"), leagueId, type: "LEAGUE_CREATED", createdAt, updatedAt: createdAt, updatedBy: null, operationId: makeId("op"), version: 1, payload: { migratedFromLegacy: true } }];
  purchases.forEach((purchase) => {
    eventLog.push({ id: makeId("event"), leagueId, type: "PLAYER_PURCHASED", createdAt: purchase.createdAt, updatedAt: purchase.createdAt, updatedBy: null, operationId: purchase.id, version: 1, payload: { purchaseId: purchase.id } });
  });

  return {
    id: leagueId,
    schemaVersion: SCHEMA_VERSION,
    name: "Mi Liga",
    season: String(new Date(now).getFullYear()),
    createdAt,
    updatedAt: now,
    status: purchases.length > 0 ? "LIVE" : "PRE-DRAFT",
    config: { budget: DEFAULT_BUDGET, minimumBid: DEFAULT_MINIMUM_BID, scoring: DEFAULT_SCORING, roster: DEFAULT_ROSTER, slots },
    teams,
    purchases,
    eventLog,
    spectatorId: null,
    spectatorPinEnabled: false,
  };
}

export function ensureMigrated(): void {
  try {
    if (localStorage.getItem(APP_KEY)) return;
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const legacy = JSON.parse(legacyRaw) as LegacyData;
    const league = buildLeagueFromLegacy(legacy);
    saveLeague(league);
    // lastOpenedLeagueId stays null on purpose: the public "/" route never auto-opens a league,
    // even the one just migrated. It becomes visible and openable from "Mis ligas".
    saveAppData({ schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, lastOpenedLeagueId: null, dark: typeof legacy.dark === "boolean" ? legacy.dark : true, sound: true });
  } catch {
    // Never let a corrupt legacy save block the app; the legacy key is left untouched either way.
  }
}
