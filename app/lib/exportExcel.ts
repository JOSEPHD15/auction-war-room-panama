import * as XLSX from "xlsx";
import playerCatalog from "../players.json";
import { describeEvent } from "./activityFeed";
import { statsFor } from "./formulas";
import { normalizedPlayerName } from "./text";
import type { League, Player } from "./types";

const PLAYERS = playerCatalog as Player[];
const CURRENCY_FORMAT = '"$"#,##0';
const DATE_FORMAT = "dd/mm/yyyy hh:mm";

/** Excel/CSV formula-injection guard: a leading =, +, -, or @ in a user-entered string (league/team names) is neutralized as literal text. */
function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

type CellValue = string | number | Date | null;

function buildSheet(headers: string[], rows: CellValue[][], options: { currencyCols?: number[]; dateCols?: number[]; colWidths?: number[] } = {}): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
  const lastRow = rows.length;
  const lastCol = headers.length - 1;
  if (lastRow > 0) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } }) };
  if (options.colWidths) ws["!cols"] = options.colWidths.map((wch) => ({ wch }));
  for (let r = 1; r <= lastRow; r += 1) {
    (options.currencyCols || []).forEach((c) => { const addr = XLSX.utils.encode_cell({ r, c }); if (ws[addr]) ws[addr].z = CURRENCY_FORMAT; });
    (options.dateCols || []).forEach((c) => { const addr = XLSX.utils.encode_cell({ r, c }); if (ws[addr]) ws[addr].z = DATE_FORMAT; });
  }
  return ws;
}

function buildResumenSheet(league: League): XLSX.WorkSheet {
  const spent = league.purchases.reduce((sum, purchase) => sum + purchase.price, 0);
  const remaining = league.config.budget * league.teams.length - spent;
  const priciest = [...league.purchases].sort((a, b) => b.price - a.price)[0];
  const rows: CellValue[][] = [
    ["Nombre de la liga", safeText(league.name)],
    ["Temporada", safeText(league.season)],
    ["Estado", league.status],
    ["Fecha de exportación", new Date()],
    ["Cantidad de equipos", league.teams.length],
    ["Presupuesto inicial por equipo", league.config.budget],
    ["Puja mínima", league.config.minimumBid],
    ["Total gastado", spent],
    ["Total restante", remaining],
    ["Compra más cara", priciest ? `${safeText(priciest.playerName)} · $${priciest.price}` : "—"],
  ];
  const ws = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...rows], { cellDates: true });
  ws["!cols"] = [{ wch: 28 }, { wch: 26 }];
  [5, 6, 7, 8].forEach((r) => { const addr = XLSX.utils.encode_cell({ r, c: 1 }); if (ws[addr]) ws[addr].z = CURRENCY_FORMAT; });
  const dateAddr = XLSX.utils.encode_cell({ r: 3, c: 1 });
  if (ws[dateAddr]) ws[dateAddr].z = DATE_FORMAT;
  return ws;
}

function buildEquiposSheet(league: League): XLSX.WorkSheet {
  const rows: CellValue[][] = league.teams.map((team) => {
    const stats = statsFor(league, team.id);
    return [safeText(team.name), league.config.budget, stats.spent, stats.remaining, stats.filled, stats.emptySlots, Math.max(0, Math.round(stats.maxBid)), Number(stats.average.toFixed(2))];
  });
  return buildSheet(["Equipo", "Presupuesto inicial", "Gastado", "Restante", "Slots llenos", "Slots vacíos", "Máxima puja", "Precio promedio"], rows, { currencyCols: [1, 2, 3, 6, 7], colWidths: [22, 16, 12, 12, 12, 12, 12, 14] });
}

function buildRostersSheet(league: League): XLSX.WorkSheet {
  const overallRank = new Map(PLAYERS.map((player, index) => [normalizedPlayerName(player.nombre), index + 1]));
  const positionRank = new Map<string, number>();
  PLAYERS.forEach((player) => {
    const key = normalizedPlayerName(player.nombre);
    const rank = PLAYERS.filter((item) => item.posicion === player.posicion).findIndex((item) => normalizedPlayerName(item.nombre) === key) + 1;
    positionRank.set(key, rank);
  });
  const teamName = new Map(league.teams.map((team) => [team.id, team.name]));
  const slotLabel = new Map(league.config.slots.map((slot) => [slot.id, slot.label]));
  const rows: CellValue[][] = league.purchases
    .slice()
    .sort((a, b) => (teamName.get(a.teamId) || "").localeCompare(teamName.get(b.teamId) || "") || a.createdAt - b.createdAt)
    .map((purchase) => {
      const key = normalizedPlayerName(purchase.playerName);
      const catalogPlayer = PLAYERS.find((player) => normalizedPlayerName(player.nombre) === key);
      return [safeText(teamName.get(purchase.teamId) || ""), slotLabel.get(purchase.slotId) || "", safeText(purchase.playerName), purchase.position, catalogPlayer?.equipoNFL || "", purchase.price, overallRank.get(key) || "", positionRank.get(key) || ""];
    });
  return buildSheet(["Equipo", "Slot", "Jugador", "Posición", "Equipo NFL", "Precio", "Ranking general", "Ranking de posición"], rows, { currencyCols: [5], colWidths: [20, 10, 24, 10, 12, 10, 14, 16] });
}

function buildComprasSheet(league: League): XLSX.WorkSheet {
  const teamName = new Map(league.teams.map((team) => [team.id, team.name]));
  const slotLabel = new Map(league.config.slots.map((slot) => [slot.id, slot.label]));
  const ordered = [...league.purchases].sort((a, b) => a.createdAt - b.createdAt);
  const rows: CellValue[][] = ordered.map((purchase, index) => [index + 1, new Date(purchase.createdAt), safeText(purchase.playerName), purchase.position, safeText(teamName.get(purchase.teamId) || ""), purchase.price, slotLabel.get(purchase.slotId) || "", "—", purchase.id]);
  return buildSheet(["Número", "Fecha y hora", "Jugador", "Posición", "Equipo ganador", "Precio", "Slot", "Responsable", "ID de compra"], rows, { currencyCols: [5], dateCols: [1], colWidths: [8, 20, 24, 10, 20, 10, 10, 14, 26] });
}

function buildHistorialSheet(league: League): XLSX.WorkSheet {
  const ordered = [...league.eventLog].sort((a, b) => a.createdAt - b.createdAt);
  const rows: CellValue[][] = ordered.map((event) => {
    const entry = describeEvent(league, event);
    return [entry.label, new Date(entry.timestamp), event.type, entry.jugador ? safeText(entry.jugador) : "", entry.equipo ? safeText(entry.equipo) : "", entry.precio, entry.updatedBy || "—", event.operationId];
  });
  return buildSheet(["Evento", "Fecha", "Acción", "Jugador", "Equipo", "Precio", "Responsable", "Operation ID"], rows, { currencyCols: [5], dateCols: [1], colWidths: [20, 20, 18, 22, 20, 10, 14, 26] });
}

function buildConfiguracionSheet(league: League): XLSX.WorkSheet {
  const header: CellValue[][] = [
    ["Nombre de la liga", safeText(league.name)],
    ["Temporada", safeText(league.season)],
    ["Puntuación", safeText(league.config.scoring)],
    ["Presupuesto", league.config.budget],
    ["Puja mínima", league.config.minimumBid],
  ];
  const ws = XLSX.utils.aoa_to_sheet([["Campo", "Valor"], ...header, [], ["Slot", "Posiciones permitidas"], ...league.config.slots.map((slot) => [slot.label, slot.positions === "ANY" ? "Cualquiera" : slot.positions.join(", ")])], { cellDates: true });
  ws["!cols"] = [{ wch: 24 }, { wch: 30 }];
  const budgetAddr = XLSX.utils.encode_cell({ r: 4, c: 1 });
  if (ws[budgetAddr]) ws[budgetAddr].z = CURRENCY_FORMAT;
  return ws;
}

function buildAgentesLibresSheet(league: League): XLSX.WorkSheet {
  const drafted = new Set(league.purchases.map((purchase) => normalizedPlayerName(purchase.playerName)));
  const overallRank = new Map(PLAYERS.map((player, index) => [normalizedPlayerName(player.nombre), index + 1]));
  const rows: CellValue[][] = PLAYERS.filter((player) => !drafted.has(normalizedPlayerName(player.nombre))).map((player) => {
    const key = normalizedPlayerName(player.nombre);
    const positionRank = PLAYERS.filter((item) => item.posicion === player.posicion).findIndex((item) => normalizedPlayerName(item.nombre) === key) + 1;
    return [safeText(player.nombre), player.posicion, player.equipoNFL || "", "", overallRank.get(key) || "", positionRank];
  });
  return buildSheet(["Jugador", "Posición", "Equipo NFL", "Bye", "Ranking general", "Ranking por posición"], rows, { colWidths: [26, 10, 12, 8, 14, 16] });
}

export function buildLeagueWorkbook(league: League): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildResumenSheet(league), "Resumen");
  XLSX.utils.book_append_sheet(workbook, buildEquiposSheet(league), "Equipos");
  XLSX.utils.book_append_sheet(workbook, buildRostersSheet(league), "Rosters");
  XLSX.utils.book_append_sheet(workbook, buildComprasSheet(league), "Compras");
  XLSX.utils.book_append_sheet(workbook, buildHistorialSheet(league), "Historial");
  XLSX.utils.book_append_sheet(workbook, buildConfiguracionSheet(league), "Configuración");
  XLSX.utils.book_append_sheet(workbook, buildAgentesLibresSheet(league), "Agentes Libres");
  return workbook;
}

export function downloadLeagueExcel(league: League): void {
  const workbook = buildLeagueWorkbook(league);
  const safeName = league.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "liga";
  XLSX.writeFile(workbook, `${safeName}-${league.season}-draft.xlsx`);
}
