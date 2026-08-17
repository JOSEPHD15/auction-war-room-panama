import { buildSlots, DEFAULT_BUDGET, DEFAULT_MINIMUM_BID, DEFAULT_ROSTER, DEFAULT_SCORING } from "./formulas";
import { makeId } from "./ids";
import { APP_VERSION, SCHEMA_VERSION } from "./storage";
import type { DraftStatus, League, LeagueEvent, Position, Purchase, RosterCounts, Slot, Team } from "./types";

export type CreateLeagueInput = { name: string; season: string; teamCount: number; budget?: number; minimumBid?: number; scoring?: string; roster?: RosterCounts };

export function defaultTeamNames(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Equipo ${index + 1}`);
}

export function createLeague(input: CreateLeagueInput): League {
  const id = makeId("league");
  const now = Date.now();
  const roster = input.roster || DEFAULT_ROSTER;
  const teams: Team[] = defaultTeamNames(Math.min(16, Math.max(2, input.teamCount))).map((name) => ({ id: makeId("team"), name }));
  const createdEvent: LeagueEvent = { id: makeId("event"), leagueId: id, type: "LEAGUE_CREATED", createdAt: now, updatedAt: now, updatedBy: null, operationId: makeId("op"), version: 1, payload: { name: input.name } };
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    name: input.name.trim() || "Nueva Liga",
    season: input.season.trim() || String(new Date(now).getFullYear()),
    createdAt: now,
    updatedAt: now,
    status: "PRE-DRAFT",
    config: { budget: input.budget ?? DEFAULT_BUDGET, minimumBid: input.minimumBid ?? DEFAULT_MINIMUM_BID, scoring: input.scoring?.trim() || DEFAULT_SCORING, roster, slots: buildSlots(roster) },
    teams,
    purchases: [],
    eventLog: [createdEvent],
  };
}

export function duplicateLeague(source: League): League {
  const id = makeId("league");
  const now = Date.now();
  const createdEvent: LeagueEvent = { id: makeId("event"), leagueId: id, type: "LEAGUE_CREATED", createdAt: now, updatedAt: now, updatedBy: null, operationId: makeId("op"), version: 1, payload: { duplicatedFrom: source.id } };
  return {
    ...source,
    id,
    name: `${source.name} (copia)`,
    createdAt: now,
    updatedAt: now,
    status: "PRE-DRAFT",
    teams: source.teams.map((team) => ({ ...team })),
    purchases: [],
    eventLog: [createdEvent],
  };
}

export function withFreshId(league: League): League {
  return { ...league, id: makeId("league"), name: `${league.name} (copia)` };
}

export type LeagueBackupFile = { schemaVersion: number; appVersion: string; exportedAt: number; league: League };
export type AllLeaguesBackupFile = { schemaVersion: number; appVersion: string; exportedAt: number; leagues: League[] };

export function exportLeaguePayload(league: League): LeagueBackupFile {
  return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: Date.now(), league };
}

export function exportAllLeaguesPayload(leagues: League[]): AllLeaguesBackupFile {
  return { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: Date.now(), leagues };
}

const VALID_STATUSES: DraftStatus[] = ["PRE-DRAFT", "LIVE", "FINALIZADO"];
const VALID_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

function isSlot(value: unknown): value is Slot {
  if (!value || typeof value !== "object") return false;
  const slot = value as Slot;
  const positionsOk = slot.positions === "ANY" || (Array.isArray(slot.positions) && slot.positions.every((p) => VALID_POSITIONS.includes(p)));
  return typeof slot.id === "string" && typeof slot.label === "string" && positionsOk && ["start", "flex", "bench"].includes(slot.kind);
}

function isTeam(value: unknown): value is Team {
  if (!value || typeof value !== "object") return false;
  const team = value as Team;
  return typeof team.id === "string" && typeof team.name === "string";
}

function isPurchase(value: unknown, teamIds: Set<string>, slotIds: Set<string>): value is Purchase {
  if (!value || typeof value !== "object") return false;
  const purchase = value as Purchase;
  return (
    typeof purchase.id === "string" &&
    teamIds.has(purchase.teamId) &&
    slotIds.has(purchase.slotId) &&
    typeof purchase.playerName === "string" &&
    VALID_POSITIONS.includes(purchase.position) &&
    typeof purchase.price === "number" &&
    Number.isFinite(purchase.price) &&
    typeof purchase.createdAt === "number" &&
    typeof purchase.updatedAt === "number"
  );
}

function isEvent(value: unknown): value is LeagueEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as LeagueEvent;
  return typeof event.id === "string" && typeof event.leagueId === "string" && typeof event.type === "string" && typeof event.operationId === "string" && typeof event.createdAt === "number";
}

export function validateLeague(value: unknown): { ok: true; league: League } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "El archivo no contiene una liga válida." };
  const league = value as League;
  if (typeof league.id !== "string" || !league.id) return { ok: false, error: "Falta el ID de la liga." };
  if (typeof league.name !== "string" || !league.name.trim()) return { ok: false, error: "Falta el nombre de la liga." };
  if (!VALID_STATUSES.includes(league.status)) return { ok: false, error: "Estado de draft inválido." };
  if (!league.config || typeof league.config.budget !== "number" || typeof league.config.minimumBid !== "number" || typeof league.config.scoring !== "string") return { ok: false, error: "Configuración de liga inválida." };
  if (!Array.isArray(league.config.slots) || !league.config.slots.every(isSlot)) return { ok: false, error: "Los slots de la liga son inválidos." };
  if (!Array.isArray(league.teams) || !league.teams.every(isTeam)) return { ok: false, error: "Los equipos de la liga son inválidos." };
  const slotIds = new Set(league.config.slots.map((slot) => slot.id));
  if (slotIds.size !== league.config.slots.length) return { ok: false, error: "Hay slots duplicados en la liga." };
  const teamIds = new Set(league.teams.map((team) => team.id));
  if (teamIds.size !== league.teams.length) return { ok: false, error: "Hay equipos duplicados en la liga." };
  if (!Array.isArray(league.purchases) || !league.purchases.every((purchase) => isPurchase(purchase, teamIds, slotIds))) return { ok: false, error: "Las compras de la liga son inválidas o referencian equipos/slots inexistentes." };
  const purchaseIds = new Set(league.purchases.map((purchase) => purchase.id));
  if (purchaseIds.size !== league.purchases.length) return { ok: false, error: "Hay compras duplicadas en la liga." };
  if (!Array.isArray(league.eventLog) || !league.eventLog.every(isEvent)) return { ok: false, error: "El event log de la liga es inválido." };
  return { ok: true, league };
}

export function parseImportFile(text: string): { ok: true; leagues: League[] } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es JSON válido." };
  }
  if (!data || typeof data !== "object") return { ok: false, error: "El archivo no tiene el formato esperado." };
  const container = data as Partial<LeagueBackupFile & AllLeaguesBackupFile>;
  const candidates: unknown[] = Array.isArray(container.leagues) ? container.leagues : container.league ? [container.league] : [];
  if (!candidates.length) return { ok: false, error: "El archivo no contiene ninguna liga." };
  const leagues: League[] = [];
  for (const candidate of candidates) {
    const result = validateLeague(candidate);
    if (!result.ok) return { ok: false, error: result.error };
    leagues.push(result.league);
  }
  return { ok: true, leagues };
}
