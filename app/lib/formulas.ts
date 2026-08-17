import { makeId } from "./ids";
import type { League, Position, RosterCounts, Slot } from "./types";

export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export const DEFAULT_ROSTER: RosterCounts = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1, FLEX: 1, BENCH: 5 };
export const DEFAULT_BUDGET = 200;
export const DEFAULT_MINIMUM_BID = 1;

function categorySlots(position: Position, count: number): Slot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: makeId("slot"),
    label: count > 1 ? `${position}${index + 1}` : position,
    positions: [position],
    kind: "start" as const,
  }));
}

export function buildSlots(roster: RosterCounts): Slot[] {
  return [
    ...categorySlots("QB", roster.QB),
    ...categorySlots("RB", roster.RB),
    ...categorySlots("WR", roster.WR),
    ...categorySlots("TE", roster.TE),
    ...Array.from({ length: roster.FLEX }, (_, index) => ({ id: makeId("slot"), label: roster.FLEX > 1 ? `FLEX${index + 1}` : "FLEX", positions: ["RB", "WR", "TE"] as Position[], kind: "flex" as const })),
    ...categorySlots("K", roster.K),
    ...categorySlots("DEF", roster.DEF),
    ...Array.from({ length: roster.BENCH }, (_, index) => ({ id: makeId("slot"), label: `Banca ${index + 1}`, positions: "ANY" as const, kind: "bench" as const })),
  ];
}

export function allowedPositions(slot: Slot): Position[] {
  return slot.positions === "ANY" ? POSITIONS : slot.positions;
}

export function money(value: number): string {
  return `$${Math.max(0, Math.round(value))}`;
}

export type TeamStats = { spent: number; filled: number; emptySlots: number; remaining: number; maxBid: number; average: number };

export function statsFor(league: League, teamId: string): TeamStats {
  const totalSlots = league.config.slots.length;
  const teamPurchases = league.purchases.filter((purchase) => purchase.teamId === teamId);
  const spent = teamPurchases.reduce((sum, purchase) => sum + purchase.price, 0);
  const filled = teamPurchases.length;
  const emptySlots = Math.max(0, totalSlots - filled);
  const remaining = league.config.budget - spent;
  const maxBid = emptySlots === 0 ? 0 : emptySlots === 1 ? remaining : remaining - (emptySlots - 1) * league.config.minimumBid;
  const average = emptySlots > 0 ? remaining / emptySlots : 0;
  return { spent, filled, emptySlots, remaining, maxBid, average };
}

export function emptySlotsForTeam(league: League, teamId: string): Slot[] {
  const occupied = new Set(league.purchases.filter((purchase) => purchase.teamId === teamId).map((purchase) => purchase.slotId));
  return league.config.slots.filter((slot) => !occupied.has(slot.id));
}
