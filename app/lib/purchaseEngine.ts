import playerCatalog from "../players.json";
import { statsFor } from "./formulas";
import { makeId } from "./ids";
import { normalizedPlayerName } from "./text";
import type { League, LeagueEvent, Player, Purchase, PurchaseInput, Slot } from "./types";

const PLAYERS = playerCatalog as Player[];
const playerByName = new Map(PLAYERS.map((player) => [normalizedPlayerName(player.nombre), player]));

export type PurchaseResult = { ok: true; league: League; purchase: Purchase } | { ok: false; error: string };

function isOperationApplied(league: League, operationId: string): boolean {
  return league.eventLog.some((event) => event.operationId === operationId);
}

function pushEvent(league: League, event: Omit<LeagueEvent, "id" | "leagueId" | "version" | "updatedBy">): League {
  const entry: LeagueEvent = { id: makeId("event"), leagueId: league.id, version: league.eventLog.length + 1, updatedBy: null, ...event };
  return { ...league, eventLog: [...league.eventLog, entry] };
}

function pickSlotForPosition(league: League, teamId: string, position: Player["posicion"], excludePurchaseId?: string): Slot | null {
  const occupied = new Set(league.purchases.filter((purchase) => purchase.teamId === teamId && purchase.id !== excludePurchaseId).map((purchase) => purchase.slotId));
  const empty = league.config.slots.filter((slot) => !occupied.has(slot.id));
  const naturalExact = empty.find((slot) => slot.kind === "start" && slot.positions !== "ANY" && slot.positions.length === 1 && slot.positions[0] === position);
  if (naturalExact) return naturalExact;
  const otherMandatory = empty.find((slot) => slot.kind === "start" && slot.positions !== "ANY" && slot.positions.includes(position));
  if (otherMandatory) return otherMandatory;
  const flex = empty.find((slot) => slot.kind === "flex" && slot.positions !== "ANY" && slot.positions.includes(position));
  if (flex) return flex;
  const bench = empty.find((slot) => slot.kind === "bench" && (slot.positions === "ANY" || slot.positions.includes(position)));
  return bench || null;
}

function isPlayerTaken(league: League, playerName: string, excludePurchaseId?: string): boolean {
  const normalized = normalizedPlayerName(playerName);
  return league.purchases.some((purchase) => purchase.id !== excludePurchaseId && normalizedPlayerName(purchase.playerName) === normalized);
}

/** Single engine used by quick-entry, "última compra", and board edits. Validation order is fixed by spec. */
export function applyPurchase(league: League, input: PurchaseInput, operationId: string): PurchaseResult {
  const player = playerByName.get(normalizedPlayerName(input.playerName));
  if (!player) return { ok: false, error: "Selecciona un jugador de la lista." };
  if (isPlayerTaken(league, input.playerName)) return { ok: false, error: `${player.nombre} ya fue comprado.` };
  const team = league.teams.find((item) => item.id === input.teamId);
  if (!team) return { ok: false, error: "Selecciona el equipo comprador." };
  const slot = input.slotId ? league.config.slots.find((item) => item.id === input.slotId) : pickSlotForPosition(league, team.id, player.posicion);
  if (!slot) return { ok: false, error: `${team.name} no tiene un slot compatible disponible.` };
  const price = Number(input.price);
  if (!Number.isFinite(price)) return { ok: false, error: "Ingresa un precio válido." };
  if (price < league.config.minimumBid) return { ok: false, error: `La puja mínima es $${league.config.minimumBid}.` };
  const stats = statsFor(league, team.id);
  if (price > stats.maxBid) return { ok: false, error: `Puja inválida: ${team.name} solo puede pagar hasta $${Math.max(0, Math.round(stats.maxBid))}.` };
  if (isOperationApplied(league, operationId)) return { ok: false, error: "Esta operación ya fue registrada." };
  if (league.status !== "LIVE") return { ok: false, error: "El draft debe estar en curso (LIVE) para registrar compras." };

  const now = Date.now();
  const purchase: Purchase = { id: makeId("purchase"), teamId: team.id, slotId: slot.id, playerName: player.nombre, position: player.posicion, price, createdAt: now, updatedAt: now };
  let next: League = { ...league, purchases: [...league.purchases, purchase] };
  next = pushEvent(next, { type: "PLAYER_PURCHASED", createdAt: now, updatedAt: now, operationId, payload: { purchaseId: purchase.id, teamId: team.id, slotId: slot.id, playerName: purchase.playerName, price } });
  return { ok: true, league: next, purchase };
}

export function editPurchase(league: League, purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }, operationId: string): PurchaseResult {
  const existing = league.purchases.find((purchase) => purchase.id === purchaseId);
  if (!existing) return { ok: false, error: "La compra ya no existe." };
  const nextPlayerName = patch.playerName ?? existing.playerName;
  const player = playerByName.get(normalizedPlayerName(nextPlayerName));
  if (!player) return { ok: false, error: "Selecciona un jugador de la lista." };
  if (isPlayerTaken(league, nextPlayerName, purchaseId)) return { ok: false, error: `${player.nombre} ya fue comprado.` };
  const teamId = patch.teamId ?? existing.teamId;
  const team = league.teams.find((item) => item.id === teamId);
  if (!team) return { ok: false, error: "Selecciona el equipo comprador." };
  const withoutExisting: League = { ...league, purchases: league.purchases.filter((purchase) => purchase.id !== purchaseId) };
  const slot = teamId === existing.teamId && player.posicion === existing.position ? league.config.slots.find((item) => item.id === existing.slotId) || null : pickSlotForPosition(withoutExisting, teamId, player.posicion);
  if (!slot) return { ok: false, error: `${team.name} no tiene un slot compatible disponible.` };
  const price = Number(patch.price ?? existing.price);
  if (!Number.isFinite(price)) return { ok: false, error: "Ingresa un precio válido." };
  if (price < league.config.minimumBid) return { ok: false, error: `La puja mínima es $${league.config.minimumBid}.` };
  const stats = statsFor(withoutExisting, teamId);
  if (price > stats.maxBid) return { ok: false, error: `Puja inválida: ${team.name} solo puede pagar hasta $${Math.max(0, Math.round(stats.maxBid))}.` };
  if (isOperationApplied(league, operationId)) return { ok: false, error: "Esta operación ya fue registrada." };
  if (league.status !== "LIVE") return { ok: false, error: "El draft debe estar en curso (LIVE) para editar compras." };

  const now = Date.now();
  const updated: Purchase = { ...existing, teamId, slotId: slot.id, playerName: player.nombre, position: player.posicion, price, updatedAt: now };
  let next: League = { ...withoutExisting, purchases: [...withoutExisting.purchases, updated] };
  next = pushEvent(next, { type: "PURCHASE_EDITED", createdAt: now, updatedAt: now, operationId, payload: { previous: existing, next: updated } });
  return { ok: true, league: next, purchase: updated };
}

export function movePurchase(league: League, purchaseId: string, targetSlotId: string, operationId: string): PurchaseResult {
  const existing = league.purchases.find((purchase) => purchase.id === purchaseId);
  if (!existing) return { ok: false, error: "La compra ya no existe." };
  if (targetSlotId === existing.slotId) return { ok: false, error: "El jugador ya está en ese slot." };
  const targetSlot = league.config.slots.find((slot) => slot.id === targetSlotId);
  if (!targetSlot) return { ok: false, error: "Slot inválido." };
  const compatible = targetSlot.positions === "ANY" || targetSlot.positions.includes(existing.position);
  if (!compatible) return { ok: false, error: `${existing.playerName} no puede ocupar ese slot.` };
  const occupied = league.purchases.some((purchase) => purchase.teamId === existing.teamId && purchase.slotId === targetSlotId);
  if (occupied) return { ok: false, error: "Ese slot ya está ocupado." };
  if (isOperationApplied(league, operationId)) return { ok: false, error: "Esta operación ya fue registrada." };
  if (league.status !== "LIVE") return { ok: false, error: "El draft debe estar en curso (LIVE) para mover jugadores." };

  const now = Date.now();
  const updated: Purchase = { ...existing, slotId: targetSlotId, updatedAt: now };
  let next: League = { ...league, purchases: league.purchases.map((purchase) => (purchase.id === purchaseId ? updated : purchase)) };
  next = pushEvent(next, { type: "PLAYER_MOVED", createdAt: now, updatedAt: now, operationId, payload: { purchaseId, fromSlotId: existing.slotId, toSlotId: targetSlotId } });
  return { ok: true, league: next, purchase: updated };
}

export function undoLastPurchase(league: League, operationId: string): PurchaseResult {
  if (league.status !== "LIVE") return { ok: false, error: "El draft debe estar en curso (LIVE) para deshacer." };
  if (isOperationApplied(league, operationId)) return { ok: false, error: "Esta operación ya fue registrada." };
  const latest = [...league.purchases].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) return { ok: false, error: "No hay compras para deshacer." };
  const now = Date.now();
  let next: League = { ...league, purchases: league.purchases.filter((purchase) => purchase.id !== latest.id) };
  next = pushEvent(next, { type: "PURCHASE_UNDONE", createdAt: now, updatedAt: now, operationId, payload: { purchaseId: latest.id, purchase: latest } });
  return { ok: true, league: next, purchase: latest };
}
