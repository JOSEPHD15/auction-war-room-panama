import type { League } from "./types";

export async function publishSpectatorSnapshot(league: League, options: { pin?: string | null; previousSpectatorId?: string | null } = {}): Promise<{ ok: boolean; error?: string }> {
  if (!league.spectatorId) return { ok: false, error: "Esta liga no tiene modo espectador activado." };
  try {
    const body: Record<string, unknown> = { spectatorId: league.spectatorId, leagueId: league.id, league };
    if ("pin" in options) body.pin = options.pin ?? null;
    if (options.previousSpectatorId) body.previousSpectatorId = options.previousSpectatorId;
    const response = await fetch("/api/spectator", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || `Error ${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sin conexión — se reintentará en el próximo cambio." };
  }
}

export async function disableSpectatorSnapshot(spectatorId: string): Promise<void> {
  try {
    await fetch(`/api/spectator/${spectatorId}`, { method: "DELETE" });
  } catch {
    // best effort — the row will simply go stale if this fails
  }
}

export type SpectatorFetchResult =
  | { status: "ok"; league: League; updatedAt: number }
  | { status: "needs-pin" }
  | { status: "invalid-pin" }
  | { status: "not-found" }
  | { status: "error"; error: string };

export async function fetchSpectatorSnapshot(spectatorId: string, pin?: string): Promise<SpectatorFetchResult> {
  try {
    const url = `/api/spectator/${spectatorId}${pin ? `?pin=${encodeURIComponent(pin)}` : ""}`;
    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 404) return { status: "not-found" };
    if (response.status === 401) return { status: "needs-pin" };
    if (response.status === 403) return { status: "invalid-pin" };
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { status: "error", error: data.error || `Error ${response.status}` };
    }
    const data = (await response.json()) as { league: League; updatedAt: number };
    return { status: "ok", league: data.league, updatedAt: data.updatedAt };
  } catch {
    return { status: "error", error: "Sin conexión." };
  }
}
