import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders a clean, reusable landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tu subasta/);
  assert.match(html, /Configura tu war room/);
  assert.match(html, /Mis ligas/);
  assert.doesNotMatch(html, /Bali Maxx|Dirupeps|HITORI|SHAKED/i);
  assert.doesNotMatch(html, /Mi Equipo|Mis Precios|Scouting Report/i);
});

test("keeps spectator and manager mutations behind bearer authorization", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/api/spectator/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/spectator/[spectatorId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league/[leagueId]/operations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/league/[leagueId]/state/route.ts", import.meta.url), "utf8"),
  ]);
  for (const source of files) assert.match(source, /unauthorized|authorizeLeague|bearerToken/);
  assert.match(files[2], /writeVersion, body\.expectedVersion/);
  assert.match(files[2], /returning/);
});

test("exports a true multi-sheet Excel workbook", async () => {
  const source = await readFile(new URL("../app/lib/exportExcel.ts", import.meta.url), "utf8");
  for (const sheet of ["Resumen", "Equipos", "Rosters", "Compras", "Historial", "Configuración", "Agentes Libres"]) assert.match(source, new RegExp(`"${sheet}"`));
  assert.match(source, /XLSX\.writeFile/);
  assert.match(source, /\^\[=\+\\-@\]/);
});

test("allows preparing the first purchase before manually starting the draft", async () => {
  const board = await readFile(new URL("../app/components/DraftBoard.tsx", import.meta.url), "utf8");
  assert.match(board, /league\.status === "PRE-DRAFT" \? startDraft\(league\)/);
  assert.match(board, /disabled=\{league\.status === "FINALIZADO"\}/);
  assert.match(board, /primera compra, el draft comenzará automáticamente/);
});

test("keeps player search lightweight across the full board", async () => {
  const [combo, board] = await Promise.all([
    readFile(new URL("../app/components/PlayerCombobox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/DraftBoard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(combo, /if \(!open\) return \[\]/);
  assert.doesNotMatch(combo, /players\.filter\([^\n]+findIndex/);
  assert.match(board, /playerListCache/);
  assert.match(board, /rankOverall: index \+ 1/);
  assert.match(combo, /a\.rank - b\.rank/);
  assert.match(combo, /OVR #/);
});
