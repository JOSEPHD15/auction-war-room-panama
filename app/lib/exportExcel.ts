import ExcelJS from "exceljs";
import playerCatalog from "../players.json";
import { EVENT_LABEL, describeEvent } from "./activityFeed";
import { money, statsFor } from "./formulas";
import { normalizedPlayerName } from "./text";
import type { EventType, League, LeagueEvent, Player, Purchase, Slot } from "./types";

/**
 * Overall rank = position in the catalog array — the exact same formula the live Draft Board and
 * PlayerCombobox use (see app/components/DraftBoard.tsx's `rankOverall: index + 1`). Duplicated as a
 * one-liner rather than imported so this file has zero dependency on client components.
 */
const PLAYERS: (Player & { rankOverall: number })[] = (playerCatalog as Player[]).map((player, index) => ({ ...player, rankOverall: index + 1 }));

const CURRENCY_FORMAT = '"$"#,##0';
const DATE_FORMAT = "dd/mm/yyyy";
const TIME_FORMAT = "hh:mm";
const DATETIME_FORMAT = "dd/mm/yyyy hh:mm";

// Palette pulled straight from app/globals.css (:root / .theme-dark) so the workbook reads like the site.
const COLOR = {
  pageBg: "FF07100D",
  panel: "FF0E1915",
  panel2: "FF121F1A",
  line: "FF26342E",
  gold: "FFE8B84A",
  green: "FF26D07C",
  red: "FFFF625C",
  blue: "FF4F8CFF",
  white: "FFEEF4F0",
  muted: "FFAAB8B0",
  greenTint: "FF163A2A",
  redTint: "FF3A1E1E",
};

/** Excel/CSV formula-injection guard: a leading =, +, -, or @ in a user-entered string (league/team/player names) is neutralized as literal text. Exported for tests. */
export function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(color = COLOR.line): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: "thin", color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

/** Big gold title band across the top of a sheet, mirroring the site's dark header bar. */
function addTitleBand(ws: ExcelJS.Worksheet, title: string, subtitle: string, colSpan: number): void {
  ws.mergeCells(1, 1, 1, colSpan);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 20, bold: true, color: { argb: COLOR.gold } };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, colSpan);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Calibri", size: 10, color: { argb: COLOR.muted } };
  subtitleCell.alignment = { vertical: "middle" };
  ws.getRow(2).height = 18;

  for (let c = 1; c <= colSpan; c += 1) {
    ws.getCell(1, c).fill = solidFill(COLOR.pageBg);
    ws.getCell(2, c).fill = solidFill(COLOR.pageBg);
  }
}

/** Styles an existing header row (dark panel background, bold gold text, thin borders) — call after the row's values are already set. */
function styleHeaderRow(ws: ExcelJS.Worksheet, rowNumber: number, colCount: number): void {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR.gold } };
    cell.fill = solidFill(COLOR.panel2);
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "center", wrapText: true };
  }
}

/** Zebra-stripes a body row and applies the shared dark theme + borders. Individual cells can still override fill/font afterwards for conditional formatting. */
function styleBodyRow(ws: ExcelJS.Worksheet, rowNumber: number, colCount: number, zebraIndex: number, alignRightFrom = 99): void {
  const row = ws.getRow(rowNumber);
  const bg = zebraIndex % 2 === 0 ? COLOR.panel : COLOR.panel2;
  for (let c = 1; c <= colCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = solidFill(bg);
    cell.font = { name: "Calibri", size: 10.5, color: { argb: COLOR.white } };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : c >= alignRightFrom ? "right" : "center" };
  }
}

function setCurrency(cell: ExcelJS.Cell): void {
  cell.numFmt = CURRENCY_FORMAT;
}

function highlightMaxBid(cell: ExcelJS.Cell, maxBid: number): void {
  if (maxBid > 40) { cell.font = { ...cell.font, bold: true, color: { argb: COLOR.green } }; cell.fill = solidFill(COLOR.greenTint); }
  else if (maxBid < 6) { cell.font = { ...cell.font, bold: true, color: { argb: COLOR.red } }; cell.fill = solidFill(COLOR.redTint); }
}

function highlightNegative(cell: ExcelJS.Cell, value: number): void {
  if (value < 0) { cell.font = { ...cell.font, bold: true, color: { argb: COLOR.red } }; cell.fill = solidFill(COLOR.redTint); }
}

function highlightComplete(cell: ExcelJS.Cell, emptySlots: number): void {
  if (emptySlots === 0) { cell.font = { ...cell.font, bold: true, color: { argb: COLOR.green } }; cell.fill = solidFill(COLOR.greenTint); }
}

/** Applies autofilter + freezes the header row(s), scoped to the sheet's actual data range. */
function finalizeTable(ws: ExcelJS.Worksheet, headerRow: number, lastRow: number, colCount: number, freezeCols = 0): void {
  if (lastRow > headerRow) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: colCount } };
  }
  ws.views = [{ state: "frozen", xSplit: freezeCols, ySplit: headerRow, showGridLines: false }];
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]): void {
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
}

function overallRankOf(playerName: string): number | null {
  const key = normalizedPlayerName(playerName);
  const player = PLAYERS.find((item) => normalizedPlayerName(item.nombre) === key);
  return player ? player.rankOverall : null;
}

function nflTeamOf(playerName: string): string {
  const key = normalizedPlayerName(playerName);
  return PLAYERS.find((item) => normalizedPlayerName(item.nombre) === key)?.equipoNFL || "";
}

/** Who registered a given purchase, looked up from its PLAYER_PURCHASED event — purchases themselves don't carry `updatedBy`, only events do. */
function responsibleForPurchase(league: League, purchaseId: string): string {
  const event = league.eventLog.find((item) => item.type === "PLAYER_PURCHASED" && (item.payload as { purchaseId?: string } | null)?.purchaseId === purchaseId);
  return event?.updatedBy || "Admin";
}

// ---------------------------------------------------------------------------
// 1. RESUMEN
// ---------------------------------------------------------------------------

const RESUMEN_COLS = 8;

function buildResumenSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Resumen", { properties: { tabColor: { argb: COLOR.gold } } });
  addTitleBand(ws, safeText(league.name), `Temporada ${safeText(league.season)} · Reporte oficial del draft`, RESUMEN_COLS);

  const infoRows: [string, string | number | Date][] = [
    ["Nombre de la liga", safeText(league.name)],
    ["Temporada", safeText(league.season)],
    ["Formato de puntuación", safeText(league.config.scoring)],
    ["Cantidad de equipos", league.teams.length],
    ["Presupuesto inicial por equipo", league.config.budget],
    ["Puja mínima", league.config.minimumBid],
    ["Estado del draft", league.status],
    ["Fecha y hora de exportación", new Date()],
  ];

  let row = 4;
  infoRows.forEach(([label, value]) => {
    const labelCell = ws.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR.muted } };
    const valueCell = ws.getCell(row, 2);
    valueCell.value = value;
    valueCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: COLOR.white } };
    if (label === "Presupuesto inicial por equipo" || label === "Puja mínima") setCurrency(valueCell);
    if (value instanceof Date) valueCell.numFmt = DATETIME_FORMAT;
    row += 1;
  });

  row += 1; // blank spacer row
  const tableHeaderRow = row;
  const headers = ["Equipo", "Gastado", "Restante", "Slots llenos", "Slots vacíos", "Máxima puja", "Promedio disp./slot", "Total jugadores"];
  headers.forEach((header, index) => { ws.getCell(tableHeaderRow, index + 1).value = header; });
  styleHeaderRow(ws, tableHeaderRow, RESUMEN_COLS);
  row += 1;

  let totalSpent = 0;
  let totalRemaining = 0;
  let totalFilled = 0;
  let totalEmpty = 0;

  league.teams.forEach((team, index) => {
    const stats = statsFor(league, team.id);
    totalSpent += stats.spent;
    totalRemaining += stats.remaining;
    totalFilled += stats.filled;
    totalEmpty += stats.emptySlots;

    const values = [safeText(team.name), stats.spent, stats.remaining, stats.filled, stats.emptySlots, Math.max(0, Math.round(stats.maxBid)), Number(stats.average.toFixed(2)), stats.filled];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, RESUMEN_COLS, index, 2);
    setCurrency(ws.getCell(row, 2));
    setCurrency(ws.getCell(row, 3));
    setCurrency(ws.getCell(row, 6));
    setCurrency(ws.getCell(row, 7));

    highlightMaxBid(ws.getCell(row, 6), stats.maxBid);
    highlightNegative(ws.getCell(row, 3), stats.remaining);
    highlightComplete(ws.getCell(row, 4), stats.emptySlots);
    row += 1;
  });

  const totalsRow = row;
  const totalsValues = ["TOTAL LIGA", totalSpent, totalRemaining, totalFilled, totalEmpty, "—", "—", totalFilled];
  totalsValues.forEach((value, colIndex) => { ws.getCell(totalsRow, colIndex + 1).value = value; });
  for (let c = 1; c <= RESUMEN_COLS; c += 1) {
    const cell = ws.getCell(totalsRow, c);
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR.gold } };
    cell.fill = solidFill(COLOR.panel2);
    cell.border = thinBorder();
    cell.alignment = { horizontal: c === 1 ? "left" : "center" };
  }
  setCurrency(ws.getCell(totalsRow, 2));
  setCurrency(ws.getCell(totalsRow, 3));

  finalizeTable(ws, tableHeaderRow, totalsRow, RESUMEN_COLS);
  setColumnWidths(ws, [28, 34, 13, 12, 12, 13, 16, 14]);
}

// ---------------------------------------------------------------------------
// 2. DRAFT BOARD (visual grid, mirrors the site's table)
// ---------------------------------------------------------------------------

function buildDraftBoardSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Draft Board", { properties: { tabColor: { argb: COLOR.green } } });
  const colCount = league.teams.length + 1;
  addTitleBand(ws, "DRAFT BOARD", `${safeText(league.name)} · ${league.config.slots.length} slots · ${league.teams.length} equipos`, colCount);

  const headerRow = 4;
  ws.getCell(headerRow, 1).value = "SLOT";
  league.teams.forEach((team, index) => { ws.getCell(headerRow, index + 2).value = safeText(team.name); });
  styleHeaderRow(ws, headerRow, colCount);
  ws.getRow(headerRow).height = 26;

  const purchaseBySlotTeam = new Map<string, Purchase>();
  league.purchases.forEach((purchase) => purchaseBySlotTeam.set(`${purchase.teamId}:${purchase.slotId}`, purchase));

  league.config.slots.forEach((slot: Slot, slotIndex) => {
    const rowNumber = headerRow + 1 + slotIndex;
    const slotCell = ws.getCell(rowNumber, 1);
    slotCell.value = slot.label;
    slotCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR.gold } };
    slotCell.fill = solidFill(COLOR.panel2);
    slotCell.border = thinBorder();
    slotCell.alignment = { vertical: "middle", horizontal: "center" };

    league.teams.forEach((team, teamIndex) => {
      const cell = ws.getCell(rowNumber, teamIndex + 2);
      const purchase = purchaseBySlotTeam.get(`${team.id}:${slot.id}`);
      cell.fill = solidFill(slotIndex % 2 === 0 ? COLOR.panel : COLOR.panel2);
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (purchase) {
        cell.value = { richText: [{ font: { bold: true, size: 11, color: { argb: COLOR.white } }, text: safeText(purchase.playerName) }, { font: { size: 9, color: { argb: COLOR.gold } }, text: `\n${money(purchase.price)}` }] };
      } else {
        cell.value = "—";
        cell.font = { color: { argb: COLOR.muted }, size: 10 };
      }
    });
    ws.getRow(rowNumber).height = 32;
  });

  const footerLabels = ["Gastado", "Restante", "Máxima puja"];
  footerLabels.forEach((label, footerIndex) => {
    const rowNumber = headerRow + 1 + league.config.slots.length + footerIndex;
    const labelCell = ws.getCell(rowNumber, 1);
    labelCell.value = label;
    labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLOR.muted } };
    labelCell.fill = solidFill(COLOR.pageBg);
    labelCell.border = thinBorder();

    league.teams.forEach((team, teamIndex) => {
      const stats = statsFor(league, team.id);
      const cell = ws.getCell(rowNumber, teamIndex + 2);
      cell.fill = solidFill(COLOR.pageBg);
      cell.border = thinBorder();
      cell.font = { bold: true, color: { argb: COLOR.white } };
      cell.alignment = { horizontal: "center" };
      if (label === "Gastado") { cell.value = stats.spent; setCurrency(cell); }
      else if (label === "Restante") { cell.value = stats.remaining; setCurrency(cell); highlightNegative(cell, stats.remaining); }
      else { cell.value = Math.max(0, Math.round(stats.maxBid)); setCurrency(cell); highlightMaxBid(cell, stats.maxBid); }
    });
  });

  const lastRow = headerRow + league.config.slots.length + footerLabels.length;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: headerRow, showGridLines: false }];
  setColumnWidths(ws, [12, ...league.teams.map(() => 22)]);
  ws.getColumn(1).width = 12;
  void lastRow;
}

// ---------------------------------------------------------------------------
// 3. EQUIPOS
// ---------------------------------------------------------------------------

function categoryOccupancy(league: League, teamId: string): Record<"QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DEF" | "BENCH", number> {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0, BENCH: 0 };
  const slotById = new Map(league.config.slots.map((slot) => [slot.id, slot]));
  league.purchases.filter((purchase) => purchase.teamId === teamId).forEach((purchase) => {
    const slot = slotById.get(purchase.slotId);
    if (!slot) return;
    if (slot.kind === "flex") counts.FLEX += 1;
    else if (slot.kind === "bench") counts.BENCH += 1;
    else if (slot.positions !== "ANY" && slot.positions.length === 1) {
      const position = slot.positions[0] as keyof typeof counts;
      counts[position] += 1;
    }
  });
  return counts;
}

function rosterStateLabel(filled: number, total: number): string {
  if (filled === 0) return "Sin iniciar";
  if (filled >= total) return "Completo";
  return "En progreso";
}

const EQUIPOS_HEADERS = ["Equipo", "Presupuesto inicial", "Gastado", "Restante", "Máxima puja", "Promedio/slot vacío", "Slots llenos", "Slots vacíos", "QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "Banca", "Estado del roster"];

function buildEquiposSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Equipos", { properties: { tabColor: { argb: COLOR.blue } } });
  const colCount = EQUIPOS_HEADERS.length;
  addTitleBand(ws, "EQUIPOS", `Resumen financiero y de roster por equipo · ${safeText(league.name)}`, colCount);

  const headerRow = 4;
  EQUIPOS_HEADERS.forEach((header, index) => { ws.getCell(headerRow, index + 1).value = header; });
  styleHeaderRow(ws, headerRow, colCount);

  let row = headerRow + 1;
  league.teams.forEach((team, index) => {
    const stats = statsFor(league, team.id);
    const occupancy = categoryOccupancy(league, team.id);
    const values = [
      safeText(team.name), league.config.budget, stats.spent, stats.remaining, Math.max(0, Math.round(stats.maxBid)), Number(stats.average.toFixed(2)), stats.filled, stats.emptySlots,
      occupancy.QB, occupancy.RB, occupancy.WR, occupancy.TE, occupancy.FLEX, occupancy.K, occupancy.DEF, occupancy.BENCH,
      rosterStateLabel(stats.filled, league.config.slots.length),
    ];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, colCount, index, 2);
    [2, 3, 4, 5, 6].forEach((c) => setCurrency(ws.getCell(row, c)));
    highlightMaxBid(ws.getCell(row, 5), stats.maxBid);
    highlightNegative(ws.getCell(row, 4), stats.remaining);
    highlightComplete(ws.getCell(row, 8), stats.emptySlots);
    if (stats.emptySlots === 0) { const cell = ws.getCell(row, colCount); cell.font = { ...cell.font, bold: true, color: { argb: COLOR.green } }; }
    row += 1;
  });

  finalizeTable(ws, headerRow, row - 1, colCount, 1);
  setColumnWidths(ws, [30, 15, 12, 12, 12, 15, 11, 11, 6, 6, 6, 6, 7, 6, 6, 8, 16]);
}

// ---------------------------------------------------------------------------
// 4. ROSTERS
// ---------------------------------------------------------------------------

const ROSTERS_HEADERS = ["Equipo fantasy", "Slot", "Jugador", "Posición", "Precio", "Ranking overall", "Equipo NFL", "Fecha de compra"];

function buildRostersSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Rosters", { properties: { tabColor: { argb: COLOR.gold } } });
  const colCount = ROSTERS_HEADERS.length;
  addTitleBand(ws, "ROSTERS", `Un jugador por fila, ordenado por equipo y por slot · ${safeText(league.name)}`, colCount);

  const headerRow = 4;
  ROSTERS_HEADERS.forEach((header, index) => { ws.getCell(headerRow, index + 1).value = header; });
  styleHeaderRow(ws, headerRow, colCount);

  const teamName = new Map(league.teams.map((team) => [team.id, team.name]));
  const teamOrder = new Map(league.teams.map((team, index) => [team.id, index]));
  const slotOrder = new Map(league.config.slots.map((slot, index) => [slot.id, index]));
  const slotLabel = new Map(league.config.slots.map((slot) => [slot.id, slot.label]));

  const ordered = [...league.purchases].sort((a, b) => (teamOrder.get(a.teamId) ?? 0) - (teamOrder.get(b.teamId) ?? 0) || (slotOrder.get(a.slotId) ?? 0) - (slotOrder.get(b.slotId) ?? 0));

  let row = headerRow + 1;
  ordered.forEach((purchase, index) => {
    const values = [safeText(teamName.get(purchase.teamId) || ""), slotLabel.get(purchase.slotId) || "", safeText(purchase.playerName), purchase.position, purchase.price, overallRankOf(purchase.playerName) ?? "—", nflTeamOf(purchase.playerName) || "—", new Date(purchase.createdAt)];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, colCount, index, 3);
    setCurrency(ws.getCell(row, 5));
    ws.getCell(row, 8).numFmt = DATE_FORMAT;
    row += 1;
  });

  finalizeTable(ws, headerRow, row - 1, colCount, 1);
  setColumnWidths(ws, [28, 10, 24, 10, 10, 14, 12, 14]);
}

// ---------------------------------------------------------------------------
// 5. COMPRAS
// ---------------------------------------------------------------------------

const COMPRAS_HEADERS = ["#", "Jugador", "Posición", "Equipo comprador", "Precio", "Slot", "Fecha", "Hora", "Responsable"];

function buildComprasSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Compras", { properties: { tabColor: { argb: COLOR.green } } });
  const colCount = COMPRAS_HEADERS.length;
  addTitleBand(ws, "COMPRAS", `Historial cronológico de compras · ${safeText(league.name)}`, colCount);

  const headerRow = 4;
  COMPRAS_HEADERS.forEach((header, index) => { ws.getCell(headerRow, index + 1).value = header; });
  styleHeaderRow(ws, headerRow, colCount);

  const teamName = new Map(league.teams.map((team) => [team.id, team.name]));
  const slotLabel = new Map(league.config.slots.map((slot) => [slot.id, slot.label]));
  const ordered = [...league.purchases].sort((a, b) => a.createdAt - b.createdAt);

  let row = headerRow + 1;
  let total = 0;
  ordered.forEach((purchase, index) => {
    total += purchase.price;
    const when = new Date(purchase.createdAt);
    const values = [index + 1, safeText(purchase.playerName), purchase.position, safeText(teamName.get(purchase.teamId) || ""), purchase.price, slotLabel.get(purchase.slotId) || "", when, when, safeText(responsibleForPurchase(league, purchase.id))];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, colCount, index, 5);
    setCurrency(ws.getCell(row, 5));
    ws.getCell(row, 7).numFmt = DATE_FORMAT;
    ws.getCell(row, 8).numFmt = TIME_FORMAT;
    row += 1;
  });

  const totalsRow = row;
  ws.getCell(totalsRow, 1).value = "TOTAL";
  ws.mergeCells(totalsRow, 1, totalsRow, 4);
  ws.getCell(totalsRow, 5).value = total;
  setCurrency(ws.getCell(totalsRow, 5));
  for (let c = 1; c <= colCount; c += 1) {
    const cell = ws.getCell(totalsRow, c);
    cell.font = { bold: true, color: { argb: COLOR.gold } };
    cell.fill = solidFill(COLOR.panel2);
    cell.border = thinBorder();
  }

  finalizeTable(ws, headerRow, ordered.length ? totalsRow : headerRow, colCount, 2);
  setColumnWidths(ws, [6, 24, 10, 28, 10, 10, 13, 10, 16]);
}

// ---------------------------------------------------------------------------
// 6. HISTORIAL (human-readable audit trail — never raw JSON)
// ---------------------------------------------------------------------------

function describeEventForExcel(league: League, event: LeagueEvent): string {
  const entry = describeEvent(league, event);
  const type = event.type as EventType;
  const payload = event.payload as Record<string, unknown> | null;
  switch (type) {
    case "PLAYER_PURCHASED": return entry.jugador ? `${entry.jugador} fue comprado por ${entry.equipo} por ${money(entry.precio ?? 0)}.` : entry.label;
    case "PURCHASE_EDITED": return entry.jugador ? `La compra de ${entry.jugador} fue modificada (ahora ${money(entry.precio ?? 0)}, ${entry.equipo}).` : entry.label;
    case "PURCHASE_UNDONE": return entry.jugador ? `Se deshizo la compra de ${entry.jugador}.` : "Se deshizo la última compra.";
    case "PLAYER_MOVED": return entry.jugador ? `${entry.jugador} fue movido a otro slot.` : entry.label;
    case "DRAFT_STARTED": return "El draft fue iniciado.";
    case "DRAFT_FINALIZED": return "El draft fue finalizado.";
    case "DRAFT_REOPENED": return "El draft fue reabierto.";
    case "LEAGUE_CREATED": return "La liga fue creada.";
    case "LEAGUE_UPDATED": {
      if (payload?.reset) return "Se reiniciaron todas las compras de la liga.";
      if (payload?.config) return "La configuración de la liga fue actualizada.";
      if (payload?.renamedLeague) return "La liga cambió de nombre.";
      if (payload?.renamed) return "Uno o más equipos cambiaron de nombre.";
      if (payload?.managerAdded) return "Se agregó un co-manager a la liga.";
      if (payload?.managerRemoved) return "Se revocó el acceso de un co-manager.";
      return "La liga fue actualizada.";
    }
    default: return entry.label;
  }
}

const HISTORIAL_HEADERS = ["Fecha", "Hora", "Tipo de acción", "Descripción", "Responsable"];

function buildHistorialSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Historial", { properties: { tabColor: { argb: COLOR.muted } } });
  const colCount = HISTORIAL_HEADERS.length;
  addTitleBand(ws, "HISTORIAL", `Registro de auditoría completo · ${safeText(league.name)}`, colCount);

  const headerRow = 4;
  HISTORIAL_HEADERS.forEach((header, index) => { ws.getCell(headerRow, index + 1).value = header; });
  styleHeaderRow(ws, headerRow, colCount);

  const ordered = [...league.eventLog].sort((a, b) => a.createdAt - b.createdAt);
  let row = headerRow + 1;
  ordered.forEach((event, index) => {
    const when = new Date(event.createdAt);
    const values = [when, when, EVENT_LABEL[event.type] || event.type, safeText(describeEventForExcel(league, event)), safeText(event.updatedBy || "Admin")];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, colCount, index, 99);
    ws.getCell(row, 1).numFmt = DATE_FORMAT;
    ws.getCell(row, 2).numFmt = TIME_FORMAT;
    ws.getCell(row, 1).alignment = { horizontal: "center" };
    ws.getCell(row, 2).alignment = { horizontal: "center" };
    ws.getCell(row, 4).alignment = { horizontal: "left", wrapText: true };
    row += 1;
  });

  finalizeTable(ws, headerRow, row - 1, colCount, 2);
  setColumnWidths(ws, [13, 10, 20, 58, 16]);
}

// ---------------------------------------------------------------------------
// 7. AGENTES LIBRES
// ---------------------------------------------------------------------------

const AGENTES_HEADERS = ["Ranking overall", "Jugador", "Posición", "Equipo NFL", "Estado"];

function buildAgentesLibresSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Agentes Libres", { properties: { tabColor: { argb: COLOR.white } } });
  const colCount = AGENTES_HEADERS.length;
  const drafted = new Set(league.purchases.map((purchase) => normalizedPlayerName(purchase.playerName)));
  const available = PLAYERS.filter((player) => !drafted.has(normalizedPlayerName(player.nombre))).sort((a, b) => a.rankOverall - b.rankOverall);

  addTitleBand(ws, "AGENTES LIBRES", `${available.length} jugadores disponibles, ordenados por ranking overall`, colCount);

  const headerRow = 4;
  AGENTES_HEADERS.forEach((header, index) => { ws.getCell(headerRow, index + 1).value = header; });
  styleHeaderRow(ws, headerRow, colCount);

  let row = headerRow + 1;
  available.forEach((player, index) => {
    const values = [player.rankOverall, safeText(player.nombre), player.posicion, player.equipoNFL || "—", "Disponible"];
    values.forEach((value, colIndex) => { ws.getCell(row, colIndex + 1).value = value; });
    styleBodyRow(ws, row, colCount, index, 99);
    ws.getCell(row, 1).alignment = { horizontal: "center" };
    ws.getCell(row, 5).font = { color: { argb: COLOR.green }, bold: true };
    row += 1;
  });

  finalizeTable(ws, headerRow, row - 1, colCount, 0);
  setColumnWidths(ws, [14, 26, 10, 12, 14]);
}

// ---------------------------------------------------------------------------
// 8. CONFIGURACIÓN
// ---------------------------------------------------------------------------

function buildConfiguracionSheet(workbook: ExcelJS.Workbook, league: League): void {
  const ws = workbook.addWorksheet("Configuración", { properties: { tabColor: { argb: COLOR.gold } } });
  addTitleBand(ws, "CONFIGURACIÓN", `Ajustes generales de la liga · ${safeText(league.name)}`, 2);

  const rows: [string, string | number][] = [
    ["Nombre de la liga", safeText(league.name)],
    ["Temporada", safeText(league.season)],
    ["Formato de puntuación", safeText(league.config.scoring)],
    ["Presupuesto por equipo", league.config.budget],
    ["Puja mínima", league.config.minimumBid],
    ["Cantidad de equipos", league.teams.length],
    ["QB", league.config.roster.QB],
    ["RB", league.config.roster.RB],
    ["WR", league.config.roster.WR],
    ["TE", league.config.roster.TE],
    ["FLEX", league.config.roster.FLEX],
    ["K", league.config.roster.K],
    ["DEF", league.config.roster.DEF],
    ["Banca", league.config.roster.BENCH],
  ];

  let row = 4;
  rows.forEach(([label, value]) => {
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true, color: { argb: COLOR.muted } };
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).font = { bold: true, color: { argb: COLOR.white } };
    if (label === "Presupuesto por equipo" || label === "Puja mínima") setCurrency(ws.getCell(row, 2));
    row += 1;
  });

  row += 1;
  ws.getCell(row, 1).value = "Nombres de los equipos";
  ws.getCell(row, 1).font = { bold: true, color: { argb: COLOR.gold }, size: 12 };
  row += 1;
  league.teams.forEach((team) => {
    ws.getCell(row, 1).value = safeText(team.name);
    ws.getCell(row, 1).font = { color: { argb: COLOR.white } };
    row += 1;
  });

  setColumnWidths(ws, [32, 30]);
  ws.views = [{ state: "frozen", ySplit: 3 }];
}

// ---------------------------------------------------------------------------

export async function buildLeagueWorkbook(league: League): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Auction War Room";
  workbook.created = new Date();

  buildResumenSheet(workbook, league);
  buildDraftBoardSheet(workbook, league);
  buildEquiposSheet(workbook, league);
  buildRostersSheet(workbook, league);
  buildComprasSheet(workbook, league);
  buildHistorialSheet(workbook, league);
  buildAgentesLibresSheet(workbook, league);
  buildConfiguracionSheet(workbook, league);

  return workbook;
}

export function safeFileNameFor(league: League): string {
  const base = league.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "liga";
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-draft-${date}.xlsx`;
}

export async function downloadLeagueExcel(league: League): Promise<void> {
  const workbook = await buildLeagueWorkbook(league);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFileNameFor(league);
  anchor.click();
  URL.revokeObjectURL(url);
}
