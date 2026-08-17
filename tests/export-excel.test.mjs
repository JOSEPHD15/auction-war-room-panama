import assert from "node:assert/strict";
import test from "node:test";

const { createLeague } = await import("../app/lib/leagues.ts");
const { startDraft, finalizeDraft } = await import("../app/lib/draftStatus.ts");
const { applyPurchase } = await import("../app/lib/purchaseEngine.ts");
const { makeId } = await import("../app/lib/ids.ts");
const { buildLeagueWorkbook, safeText, safeFileNameFor } = await import("../app/lib/exportExcel.ts");
const { statsFor } = await import("../app/lib/formulas.ts");

const REQUIRED_SHEETS = ["Resumen", "Draft Board", "Equipos", "Rosters", "Compras", "Historial", "Agentes Libres", "Configuración"];

function cellText(worksheet, row, col) {
  const value = worksheet.getCell(row, col).value;
  if (value && typeof value === "object" && Array.isArray(value.richText)) return value.richText.map((run) => run.text).join("");
  return value;
}

function findHeaderRow(worksheet, expectedFirstHeader) {
  for (let row = 1; row <= 20; row += 1) {
    if (cellText(worksheet, row, 1) === expectedFirstHeader) return row;
  }
  throw new Error(`Header row starting with "${expectedFirstHeader}" not found in sheet "${worksheet.name}"`);
}

function buildTestLeague() {
  let league = createLeague({ name: "Liga de Prueba", season: "2026", teamCount: 3 });
  league = startDraft(league).league;
  const buyA = applyPurchase(league, { teamId: league.teams[0].id, playerName: "Bijan Robinson", price: 45 }, makeId("op"), "Admin");
  league = buyA.ok ? buyA.league : league;
  const buyB = applyPurchase(league, { teamId: league.teams[1].id, playerName: "Ja'Marr Chase", price: 52 }, makeId("op"), "Co-manager Juan");
  league = buyB.ok ? buyB.league : league;
  return league;
}

function sheetText(worksheet) {
  const chunks = [];
  worksheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (value && typeof value === "object" && Array.isArray(value.richText)) chunks.push(value.richText.map((run) => run.text).join(""));
      else chunks.push(String(value ?? ""));
    });
  });
  return chunks.join("\n");
}

function workbookText(workbook) {
  const chunks = [];
  workbook.eachSheet((worksheet) => chunks.push(sheetText(worksheet)));
  return chunks.join("\n");
}

test("1. the workbook contains all required sheets", async () => {
  const workbook = await buildLeagueWorkbook(buildTestLeague());
  const names = workbook.worksheets.map((ws) => ws.name);
  for (const sheet of REQUIRED_SHEETS) assert.ok(names.includes(sheet), `missing sheet: ${sheet}`);
});

test("2. Resumen is the first sheet", async () => {
  const workbook = await buildLeagueWorkbook(buildTestLeague());
  assert.equal(workbook.worksheets[0].name, "Resumen");
});

test("3. Resumen totals match statsFor() exactly (Gastado, Restante, Maxima puja)", async () => {
  const league = buildTestLeague();
  const workbook = await buildLeagueWorkbook(league);
  const ws = workbook.getWorksheet("Resumen");
  const headerRow = findHeaderRow(ws, "Equipo");

  league.teams.forEach((team, index) => {
    const stats = statsFor(league, team.id);
    const row = headerRow + 1 + index;
    assert.equal(cellText(ws, row, 1), team.name);
    assert.equal(ws.getCell(row, 2).value, stats.spent, `spent mismatch for ${team.name}`);
    assert.equal(ws.getCell(row, 3).value, stats.remaining, `remaining mismatch for ${team.name}`);
    assert.equal(ws.getCell(row, 6).value, Math.max(0, Math.round(stats.maxBid)), `maxBid mismatch for ${team.name}`);
  });

  const totalsRow = headerRow + 1 + league.teams.length;
  const expectedSpent = league.teams.reduce((sum, team) => sum + statsFor(league, team.id).spent, 0);
  const expectedRemaining = league.teams.reduce((sum, team) => sum + statsFor(league, team.id).remaining, 0);
  assert.equal(ws.getCell(totalsRow, 2).value, expectedSpent, "totals row spent mismatch");
  assert.equal(ws.getCell(totalsRow, 3).value, expectedRemaining, "totals row remaining mismatch");
});

test("4. players appear under the correct team and slot in Rosters and the Draft Board grid", async () => {
  const league = buildTestLeague();
  const workbook = await buildLeagueWorkbook(league);

  const rosters = workbook.getWorksheet("Rosters");
  const headerRow = findHeaderRow(rosters, "Equipo fantasy");
  const rows = [];
  for (let r = headerRow + 1; r <= headerRow + league.purchases.length; r += 1) {
    rows.push({ team: cellText(rosters, r, 1), slot: cellText(rosters, r, 2), player: cellText(rosters, r, 3), price: rosters.getCell(r, 5).value });
  }
  league.purchases.forEach((purchase) => {
    const team = league.teams.find((item) => item.id === purchase.teamId);
    const slot = league.config.slots.find((item) => item.id === purchase.slotId);
    const match = rows.find((row) => row.player === purchase.playerName);
    assert.ok(match, `purchase for ${purchase.playerName} missing from Rosters`);
    assert.equal(match.team, team.name);
    assert.equal(match.slot, slot.label);
    assert.equal(match.price, purchase.price);
  });

  const board = workbook.getWorksheet("Draft Board");
  const boardHeaderRow = findHeaderRow(board, "SLOT");
  league.purchases.forEach((purchase) => {
    const teamIndex = league.teams.findIndex((team) => team.id === purchase.teamId);
    const slotIndex = league.config.slots.findIndex((slot) => slot.id === purchase.slotId);
    const cellValue = cellText(board, boardHeaderRow + 1 + slotIndex, teamIndex + 2);
    assert.ok(cellValue.includes(purchase.playerName), `Draft Board cell for ${purchase.playerName} does not contain the player's name`);
  });
});

test("5. Agentes Libres is sorted strictly by overall ranking ascending", async () => {
  const workbook = await buildLeagueWorkbook(buildTestLeague());
  const ws = workbook.getWorksheet("Agentes Libres");
  const headerRow = findHeaderRow(ws, "Ranking overall");
  const ranks = [];
  let r = headerRow + 1;
  while (ws.getCell(r, 1).value !== null && ws.getCell(r, 1).value !== undefined) {
    ranks.push(ws.getCell(r, 1).value);
    r += 1;
  }
  assert.ok(ranks.length > 0, "Agentes Libres has no rows");
  for (let i = 1; i < ranks.length; i += 1) assert.ok(ranks[i] > ranks[i - 1], `ranking not ascending at index ${i}: ${ranks[i - 1]} -> ${ranks[i]}`);
});

test("6. sold players never appear in Agentes Libres", async () => {
  const league = buildTestLeague();
  const workbook = await buildLeagueWorkbook(league);
  const text = sheetText(workbook.getWorksheet("Agentes Libres"));
  league.purchases.forEach((purchase) => {
    assert.ok(!text.includes(purchase.playerName), `${purchase.playerName} was sold but still appears in Agentes Libres`);
  });
});

test("7. no credentials (adminToken, manager tokens, spectatorId) ever appear anywhere in the workbook", async () => {
  const { addManager } = await import("../app/lib/draftStatus.ts");
  let league = buildTestLeague();
  league = { ...league, spectatorId: "spectator-secret-id-should-not-leak" };
  const { league: withManager, manager } = addManager(league, "Ana");
  league = withManager;

  const workbook = await buildLeagueWorkbook(league);
  const fullText = workbookText(workbook);

  assert.ok(!fullText.includes(league.adminToken), "adminToken leaked into the exported workbook");
  assert.ok(!fullText.includes(manager.id), "a co-manager token leaked into the exported workbook");
  assert.ok(!fullText.includes(league.spectatorId), "spectatorId leaked into the exported workbook");
});

test("8. Excel Formula Injection protection is preserved for user-entered strings", () => {
  assert.equal(safeText("=cmd|'/c calc'!A0"), "'=cmd|'/c calc'!A0");
  assert.equal(safeText("+1+1"), "'+1+1");
  assert.equal(safeText("-2+3"), "'-2+3");
  assert.equal(safeText("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(safeText("Normal Team Name"), "Normal Team Name");
});

test("8b. a league with a formula-injection-shaped team name is neutralized end-to-end in the workbook", async () => {
  let league = buildTestLeague();
  league = { ...league, teams: [{ ...league.teams[0], name: "=1+1 Danger" }, ...league.teams.slice(1)] };
  const workbook = await buildLeagueWorkbook(league);
  const equipos = workbook.getWorksheet("Equipos");
  const headerRow = findHeaderRow(equipos, "Equipo");
  const cell = cellText(equipos, headerRow + 1, 1);
  assert.ok(cell.startsWith("'"), `dangerous team name was not neutralized: ${cell}`);
});

test("9. the workbook can be generated for a brand-new, empty league (PRE-DRAFT, zero purchases)", async () => {
  const league = createLeague({ name: "Liga Vacia", season: "2026", teamCount: 4 });
  const workbook = await buildLeagueWorkbook(league);
  assert.equal(workbook.worksheets.length, REQUIRED_SHEETS.length);
  const rosters = workbook.getWorksheet("Rosters");
  const headerRow = findHeaderRow(rosters, "Equipo fantasy");
  assert.equal(rosters.getCell(headerRow + 1, 1).value, null, "empty league should have no roster rows");
});

test("10. the workbook can be generated for a partially-drafted league and for a finalized league", async () => {
  const partial = buildTestLeague();
  const partialWorkbook = await buildLeagueWorkbook(partial);
  assert.equal(partialWorkbook.getWorksheet("Resumen").name, "Resumen");

  const finalizedResult = finalizeDraft(partial);
  assert.ok(finalizedResult.ok, "finalizeDraft should succeed for a LIVE league");
  const finalized = finalizedResult.league;
  const finalizedWorkbook = await buildLeagueWorkbook(finalized);
  const resumen = finalizedWorkbook.getWorksheet("Resumen");
  assert.equal(resumen.getCell(10, 2).value, "FINALIZADO");
});

test("bonus: the generated file name follows nombre-de-liga-draft-YYYY-MM-DD.xlsx and strips unsafe characters", () => {
  const league = createLeague({ name: "Liga Ñoño! #1 / Test", season: "2026", teamCount: 2 });
  const fileName = safeFileNameFor(league);
  assert.match(fileName, /^[a-z0-9-]+-draft-\d{4}-\d{2}-\d{2}\.xlsx$/, `unexpected file name shape: ${fileName}`);
});

test("bonus: the workbook actually serializes to a real .xlsx buffer that a spreadsheet app could open", async () => {
  const workbook = await buildLeagueWorkbook(buildTestLeague());
  const buffer = await workbook.xlsx.writeBuffer();
  assert.ok(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array, "writeBuffer did not return binary data");
  assert.ok(buffer.length > 5000, "generated .xlsx buffer looks too small to be a real workbook");
  // .xlsx files are zip archives — the first two bytes are the "PK" zip signature.
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
});
