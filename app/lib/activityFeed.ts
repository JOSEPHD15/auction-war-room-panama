import { money } from "./formulas";
import type { EventType, League, LeagueEvent, Purchase } from "./types";

export const EVENT_LABEL: Record<EventType, string> = {
  LEAGUE_CREATED: "Liga creada",
  LEAGUE_UPDATED: "Liga actualizada",
  DRAFT_STARTED: "Draft iniciado",
  PLAYER_PURCHASED: "Compra registrada",
  PURCHASE_EDITED: "Compra editada",
  PURCHASE_UNDONE: "Compra deshecha",
  PLAYER_MOVED: "Jugador movido de slot",
  DRAFT_FINALIZED: "Draft finalizado",
  DRAFT_REOPENED: "Draft reabierto",
};

export type FeedEntry = { id: string; type: EventType; label: string; timestamp: number; updatedBy: string | null; jugador: string; equipo: string; precio: number | null };

function purchaseLike(payload: unknown): { playerName?: string; teamId?: string; price?: number } | undefined {
  const record = payload as Record<string, unknown> | null;
  return (record?.next || record?.purchase) as { playerName?: string; teamId?: string; price?: number } | undefined;
}

/** Single place that turns a raw Event Log entry into a human line — used by the live Activity Feed and the Excel "Historial" sheet, so they never drift apart. */
export function describeEvent(league: League, event: LeagueEvent): FeedEntry {
  const teamName = new Map(league.teams.map((team) => [team.id, team.name]));
  const payload = event.payload as Record<string, unknown> | null;
  const base = { id: event.id, type: event.type, timestamp: event.createdAt, updatedBy: event.updatedBy };

  if (event.type === "PLAYER_PURCHASED" && payload?.playerName) {
    const jugador = String(payload.playerName);
    const equipo = teamName.get(String(payload.teamId || "")) || "";
    const precio = Number(payload.price ?? 0);
    return { ...base, jugador, equipo, precio, label: `${jugador} → ${money(precio)} → ${equipo}` };
  }

  if (event.type === "PURCHASE_EDITED") {
    const next = purchaseLike(payload);
    if (next?.playerName) {
      const equipo = teamName.get(next.teamId || "") || "";
      const precio = next.price ?? 0;
      return { ...base, jugador: next.playerName, equipo, precio, label: `${next.playerName} editado → ${money(precio)} → ${equipo}` };
    }
  }

  if (event.type === "PURCHASE_UNDONE") {
    const purchase = payload?.purchase as Purchase | undefined;
    if (purchase) {
      const equipo = teamName.get(purchase.teamId) || "";
      return { ...base, jugador: purchase.playerName, equipo, precio: purchase.price, label: `${purchase.playerName} deshecho (${money(purchase.price)}, ${equipo})` };
    }
  }

  if (event.type === "PLAYER_MOVED") {
    const purchaseId = payload?.purchaseId as string | undefined;
    const toSlotId = payload?.toSlotId as string | undefined;
    const purchase = league.purchases.find((item) => item.id === purchaseId);
    const toSlot = league.config.slots.find((item) => item.id === toSlotId);
    const jugador = purchase?.playerName || "Jugador";
    const equipo = purchase ? teamName.get(purchase.teamId) || "" : "";
    return { ...base, jugador, equipo, precio: purchase?.price ?? null, label: `${jugador} movido a ${toSlot?.label || "otro slot"}` };
  }

  return { ...base, jugador: "", equipo: "", precio: null, label: EVENT_LABEL[event.type] || event.type };
}

export function buildActivityFeed(league: League, limit?: number): FeedEntry[] {
  const ordered = [...league.eventLog].sort((a, b) => b.createdAt - a.createdAt).map((event) => describeEvent(league, event));
  return limit ? ordered.slice(0, limit) : ordered;
}
