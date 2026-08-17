import type { League } from "./types";

export type LiveStateResult = { status: "ok"; league: League; writeVersion: number } | { status: "not-found" } | { status: "error"; error: string };

export async function fetchLiveState(leagueId: string): Promise<LiveStateResult> {
  try {
    const response = await fetch(`/api/league/${leagueId}/state`, { cache: "no-store" });
    if (response.status === 404) return { status: "not-found" };
    const data = (await response.json()) as { league?: League; writeVersion?: number; error?: string };
    if (!response.ok || !data.league || typeof data.writeVersion !== "number") return { status: "error", error: data.error || `Error ${response.status}` };
    return { status: "ok", league: data.league, writeVersion: data.writeVersion };
  } catch {
    return { status: "error", error: "Sin conexión." };
  }
}

export type PublishStateResult = { status: "ok"; writeVersion: number } | { status: "conflict"; league: League; writeVersion: number } | { status: "error"; error: string };

export async function publishLiveState(league: League, expectedVersion: number): Promise<PublishStateResult> {
  try {
    const response = await fetch(`/api/league/${league.id}/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ league, expectedVersion }) });
    const data = (await response.json()) as { ok?: boolean; writeVersion?: number; league?: League; error?: string };
    if (response.status === 409 && data.league && typeof data.writeVersion === "number") return { status: "conflict", league: data.league, writeVersion: data.writeVersion };
    if (!response.ok || typeof data.writeVersion !== "number") return { status: "error", error: data.error || `Error ${response.status}` };
    return { status: "ok", writeVersion: data.writeVersion };
  } catch {
    return { status: "error", error: "Sin conexión." };
  }
}

export type RemoteOperation =
  | { kind: "purchase"; teamId: string; playerName: string; price: number; slotId?: string }
  | { kind: "edit"; purchaseId: string; patch: { teamId?: string; playerName?: string; price?: number } }
  | { kind: "undo" }
  | { kind: "move"; purchaseId: string; targetSlotId: string };

export type OperationResult = { status: "ok"; league: League; writeVersion: number } | { status: "conflict"; league: League; writeVersion: number } | { status: "rejected"; error: string } | { status: "error"; error: string };

export async function applyRemoteOperation(leagueId: string, operation: RemoteOperation, operationId: string, expectedVersion: number, managerToken?: string): Promise<OperationResult> {
  try {
    const response = await fetch(`/api/league/${leagueId}/operations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managerToken, operation, operationId, expectedVersion }) });
    const data = (await response.json()) as { ok?: boolean; league?: League; writeVersion?: number; error?: string };
    if (response.status === 409 && data.league && typeof data.writeVersion === "number") return { status: "conflict", league: data.league, writeVersion: data.writeVersion };
    if (response.status === 400) return { status: "rejected", error: data.error || "Operación inválida." };
    if (!response.ok || !data.league || typeof data.writeVersion !== "number") return { status: "error", error: data.error || `Error ${response.status}` };
    return { status: "ok", league: data.league, writeVersion: data.writeVersion };
  } catch {
    return { status: "error", error: "Sin conexión." };
  }
}

export async function registerManagerToken(leagueId: string, token: string, label: string): Promise<void> {
  try {
    await fetch(`/api/league/${leagueId}/managers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, label }) });
  } catch {
    // best effort — if this fails the link just won't resolve yet; the admin can retry by re-publishing
  }
}

export async function revokeManagerToken(leagueId: string, managerId: string): Promise<void> {
  try {
    await fetch(`/api/league/${leagueId}/managers/${managerId}`, { method: "DELETE" });
  } catch {
    // best effort
  }
}

export type ResolveTokenResult = { status: "ok"; leagueId: string; label: string } | { status: "not-found" } | { status: "error"; error: string };

export async function resolveManagerToken(token: string): Promise<ResolveTokenResult> {
  try {
    const response = await fetch(`/api/managers/${token}`, { cache: "no-store" });
    if (response.status === 404) return { status: "not-found" };
    const data = (await response.json()) as { leagueId?: string; label?: string; error?: string };
    if (!response.ok || !data.leagueId) return { status: "error", error: data.error || `Error ${response.status}` };
    return { status: "ok", leagueId: data.leagueId, label: data.label || "Co-manager" };
  } catch {
    return { status: "error", error: "Sin conexión." };
  }
}
