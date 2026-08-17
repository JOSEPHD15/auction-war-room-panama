import { buildSlots } from "./formulas";
import { makeId } from "./ids";
import type { EventType, League, LeagueEvent, RosterCounts } from "./types";

type StatusResult = { ok: true; league: League } | { ok: false; error: string };

function appendEvent(league: League, type: EventType, payload: unknown): League {
  const now = Date.now();
  const event: LeagueEvent = { id: makeId("event"), leagueId: league.id, type, createdAt: now, updatedAt: now, operationId: makeId("op"), version: league.eventLog.length + 1, payload };
  return { ...league, updatedAt: now, eventLog: [...league.eventLog, event] };
}

export function startDraft(league: League): StatusResult {
  if (league.status !== "PRE-DRAFT") return { ok: false, error: "El draft ya fue iniciado." };
  return { ok: true, league: { ...appendEvent(league, "DRAFT_STARTED", {}), status: "LIVE" } };
}

export function finalizeDraft(league: League): StatusResult {
  if (league.status !== "LIVE") return { ok: false, error: "Solo se puede finalizar un draft en curso (LIVE)." };
  return { ok: true, league: { ...appendEvent(league, "DRAFT_FINALIZED", {}), status: "FINALIZADO" } };
}

export function reopenDraft(league: League): StatusResult {
  if (league.status !== "FINALIZADO") return { ok: false, error: "Solo se puede reabrir un draft finalizado." };
  return { ok: true, league: { ...appendEvent(league, "DRAFT_REOPENED", {}), status: "LIVE" } };
}

export function resetPurchases(league: League): League {
  return { ...appendEvent(league, "LEAGUE_UPDATED", { reset: true }), purchases: [] };
}

export type LeagueConfigPatch = { name?: string; season?: string; teamNames?: string[]; budget?: number; minimumBid?: number; scoring?: string; roster?: RosterCounts };

export function updateLeagueConfig(league: League, patch: LeagueConfigPatch): StatusResult {
  if (league.status !== "PRE-DRAFT") return { ok: false, error: "La configuración solo se puede editar en PRE-DRAFT." };
  const roster = patch.roster || league.config.roster;
  const teams = patch.teamNames ? patch.teamNames.map((name, index) => ({ id: league.teams[index]?.id || makeId("team"), name: name.trim() || `Equipo ${index + 1}` })) : league.teams;
  const withConfig: League = {
    ...league,
    name: patch.name?.trim() || league.name,
    season: patch.season?.trim() || league.season,
    teams,
    config: { budget: patch.budget ?? league.config.budget, minimumBid: patch.minimumBid ?? league.config.minimumBid, scoring: patch.scoring?.trim() || league.config.scoring, roster, slots: patch.roster ? buildSlots(roster) : league.config.slots },
  };
  return { ok: true, league: appendEvent(withConfig, "LEAGUE_UPDATED", { config: true }) };
}

export function renameTeams(league: League, names: Record<string, string>): League {
  const teams = league.teams.map((team) => ({ ...team, name: names[team.id]?.trim() || team.name }));
  return appendEvent({ ...league, teams }, "LEAGUE_UPDATED", { renamed: true });
}

/** Renaming the league itself is always allowed — it's metadata, not draft state, and touches no purchases/slots. */
export function renameLeague(league: League, name: string): League {
  const trimmed = name.trim();
  if (!trimmed || trimmed === league.name) return league;
  return appendEvent({ ...league, name: trimmed }, "LEAGUE_UPDATED", { renamedLeague: true });
}
