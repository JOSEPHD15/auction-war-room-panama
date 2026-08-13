"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import playerCatalog from "./players.json";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type Player = { nombre: string; posicion: Position; equipoNFL: string };
type Pick = { jugador: string; posicion: string; precio: string; objetivo: string };
type LastPick = { team: string; slot: string; jugador: string; precio: string; posicion: string; updatedAt: number };

const DEFAULT_TEAMS = ["Dirupeps", "HITORI KAKURENBO", "Chocolate Coco", "Bali Maxx", "HyP", "Sum2Prove", "SHAKED", "Deluxe", "la lavanderia", "Los culecos"];
const SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DEF", "Banca 1", "Banca 2", "Banca 3", "Banca 4", "Banca 5"];
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const BUDGET = 200;
const STORAGE_KEY = "auction-war-room-v1";

// Catálogo oficial importado desde la lista proporcionada por la liga.
const PLAYERS = playerCatalog as Player[];

const emptyPick = (): Pick => ({ jugador: "", posicion: "", precio: "", objetivo: "" });
const makeBoard = (teams = DEFAULT_TEAMS) => Object.fromEntries(teams.map((team) => [team, SLOTS.map(emptyPick)])) as Record<string, Pick[]>;
function allowedPositions(slot: string): Position[] { if (slot.startsWith("RB")) return ["RB"]; if (slot.startsWith("WR")) return ["WR"]; if (["QB","TE","K","DEF"].includes(slot)) return [slot as Position]; if (slot === "FLEX") return ["RB","WR","TE"]; return POSITIONS; }
function money(value: number) { return `$${Math.max(0, Math.round(value))}`; }
function statsFor(picks: Pick[]) { const spent = picks.reduce((sum, pick) => sum + (Number(pick.precio) || 0), 0); const filled = picks.filter((pick) => pick.jugador.trim()).length; const empty = SLOTS.length - filled; const remaining = BUDGET - spent; const maxBid = empty > 0 ? remaining - (empty - 1) : remaining; return { spent, filled, empty, remaining, maxBid, average: empty ? remaining / empty : remaining }; }

function PlayerInput({ value, onChange, options, id }: { value: string; onChange: (value: string) => void; options: Player[]; id: string }) {
  return <><input aria-label="Jugador" className="field player-field" list={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Jugador" /><datalist id={id}>{options.map((player) => <option key={`${player.nombre}-${player.posicion}`} value={player.nombre}>{player.posicion}</option>)}</datalist></>;
}

export default function Home() {
  const [dark, setDark] = useState(true);
  const [teams, setTeams] = useState<string[]>(DEFAULT_TEAMS);
  const [board, setBoard] = useState<Record<string, Pick[]>>(makeBoard);
  const [lastPick, setLastPick] = useState<LastPick | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const playerMap = useMemo(() => new Map(PLAYERS.map((player) => [player.nombre.toLowerCase(), player])), []);

  useEffect(() => { try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { const data = JSON.parse(saved); if (Array.isArray(data.teams) && data.teams.length) setTeams(data.teams); if (data.board) setBoard(data.board); if (data.lastPick) setLastPick(data.lastPick); if (typeof data.dark === "boolean") setDark(data.dark); } } catch { setToast("No se pudo restaurar el guardado anterior."); } setHydrated(true); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, teams, board, lastPick, dark })); }, [teams, board, lastPick, dark, hydrated]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2600); return () => clearTimeout(timer); }, [toast]);

  const updatePick = (team: string, slotIndex: number, patch: Partial<Pick>) => setBoard((current) => ({ ...current, [team]: (current[team] || SLOTS.map(emptyPick)).map((pick, index) => { if (index !== slotIndex) return pick; const next = { ...pick, ...patch }; if (patch.jugador !== undefined) next.posicion = playerMap.get(patch.jugador.toLowerCase())?.posicion || next.posicion; if (next.jugador.trim() && next.precio !== "") setLastPick({ team, slot: SLOTS[slotIndex], jugador: next.jugador, precio: next.precio, posicion: next.posicion, updatedAt: Date.now() }); return next; }) }));
  const applyTeams = (nextTeams: string[]) => { const cleaned = nextTeams.map((team, index) => team.trim() || `Equipo ${index + 1}`); if (new Set(cleaned.map((team) => team.toLowerCase())).size !== cleaned.length) { setToast("Cada equipo debe tener un nombre diferente."); return; } setBoard((current) => Object.fromEntries(cleaned.map((team, index) => [team, current[teams[index]] || SLOTS.map(emptyPick)])) as Record<string, Pick[]>); setLastPick((current) => current ? { ...current, team: cleaned[teams.indexOf(current.team)] || current.team } : current); setTeams(cleaned); setConfigOpen(false); setToast("Equipos actualizados."); };
  const exportJSON = () => { const blob = new Blob([JSON.stringify({ version: 3, teams, board, lastPick, dark }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "auction-board.json"; anchor.click(); URL.revokeObjectURL(url); setToast("Board exportado."); };
  const importJSON = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); if (!data.board) throw new Error(); setBoard(data.board); if (Array.isArray(data.teams)) setTeams(data.teams); setLastPick(data.lastPick || null); setToast("Board importado."); } catch { setToast("El archivo no es válido."); } event.target.value = ""; };
  const resetBoard = () => { if (confirm("¿Vaciar todo el Draft Board?")) { setBoard(makeBoard(teams)); setLastPick(null); setToast("Draft Board reiniciado."); } };

  return <main className={dark ? "app theme-dark" : "app theme-light"}>
    <header className="topbar public-topbar">
      <button className="brand" aria-label="Auction War Room"><span className="brand-mark">AW</span><span><b>AUCTION</b><small>WAR ROOM · 0.5 PPR</small></span></button>
      <div className="public-title">DRAFT BOARD <span>EN VIVO</span></div>
      <div className="header-actions"><button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="Cambiar tema">{dark ? "☀" : "◐"}</button><button className="ghost-button" onClick={exportJSON}>Exportar</button><button className="ghost-button" onClick={() => importRef.current?.click()}>Importar</button><input ref={importRef} className="sr-only" type="file" accept="application/json" onChange={importJSON} /></div>
    </header>
    <section className="page-shell">
      <div className="page-intro"><div><span className="eyebrow">Sala de subasta</span><h1>Draft Board</h1><p>Compras, presupuestos y poder de puja de toda la liga en tiempo real.</p></div><div className="intro-actions"><button className="ghost-button" onClick={() => setConfigOpen(!configOpen)}>⚙ Editar liga</button><button className="danger-button" onClick={resetBoard}>Vaciar board</button></div></div>
      {configOpen && <LeagueSettings teams={teams} onSave={applyTeams} onCancel={() => setConfigOpen(false)} />}
      <BaliSponsor />
      <LastPurchase lastPick={lastPick} />
      <div className="legend"><span><i className="dot dot-green" /> Poder de compra &gt; $40</span><span><i className="dot dot-red" /> Topado &lt; $6</span><span><i className="dot dot-gold" /> {PLAYERS.length} jugadores en catálogo + entrada libre</span></div>
      <DraftTable teams={teams} board={board} updatePick={updatePick} />
      <TeamControl teams={teams} board={board} />
      <NeedsTable teams={teams} board={board} />
    </section>
    <footer><span>Guardado automático en este dispositivo</span><span>{teams.length} equipos · $200 · 14 slots</span><span className="footer-sponsor">Sponsored by Bali Maxx</span></footer>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function BaliSponsor() { return <aside className="bali-sponsor-banner"><img src="/bali-maxx.png" alt="Bali Maxx Fantasy Football" /><div><span>SPONSORED BY</span><strong>BALI MAXX</strong><small>MINT CONDITION CHAMPIONS</small></div></aside>; }
function LastPurchase({ lastPick }: { lastPick: LastPick | null }) { return <article className={`last-pick-hero ${lastPick ? "has-pick" : ""}`}><div className="last-pick-label"><i /> ÚLTIMA COMPRA</div><div className="last-pick-main"><div><span>{lastPick?.posicion || "EN ESPERA"}</span><h2>{lastPick?.jugador || "Esperando la primera compra"}</h2><p>{lastPick ? `${lastPick.team} · ${lastPick.slot}` : "Al completar un jugador y su precio aparecerá aquí automáticamente."}</p></div><strong>{lastPick ? money(Number(lastPick.precio)) : "$—"}</strong></div></article>; }

function DraftTable({ teams, board, updatePick }: { teams: string[]; board: Record<string, Pick[]>; updatePick: (team: string, index: number, patch: Partial<Pick>) => void }) { return <div className="table-wrap board-wrap"><table className="draft-table"><thead><tr><th className="sticky-col">SLOT</th>{teams.map((team) => { const stats = statsFor(board[team] || SLOTS.map(emptyPick)); return <th key={team}><span>{team}</span><small>{money(stats.remaining)} libres</small></th>; })}</tr></thead><tbody>{SLOTS.map((slot, slotIndex) => <tr key={slot}><th className="sticky-col"><span className="slot-badge">{slot}</span></th>{teams.map((team, teamIndex) => { const pick = (board[team] || SLOTS.map(emptyPick))[slotIndex]; const options = PLAYERS.filter((player) => allowedPositions(slot).includes(player.posicion)); return <td key={team}><div className="pick-cell"><PlayerInput value={pick.jugador} onChange={(jugador) => updatePick(team, slotIndex, { jugador })} options={options} id={`board-${slotIndex}-${teamIndex}`} /><div className="price-row"><span>$</span><input aria-label={`Precio de ${team}, ${slot}`} className="price-field" type="number" min="0" max="200" value={pick.precio} onChange={(event) => updatePick(team, slotIndex, { precio: event.target.value })} placeholder="0" />{pick.posicion && <em>{pick.posicion}</em>}</div></div></td>; })}</tr>)}</tbody></table></div>; }
function TeamControl({ teams, board }: { teams: string[]; board: Record<string, Pick[]> }) { return <><div className="section-heading"><div><span className="eyebrow">Control financiero</span><h2>Poder de compra por equipo</h2></div><p>Máxima puja reserva $1 por cada slot pendiente.</p></div><div className="team-grid">{teams.map((team) => { const stats = statsFor(board[team] || SLOTS.map(emptyPick)); const tone = stats.maxBid > 40 ? "green" : stats.maxBid < 6 ? "red" : "blue"; return <article className="team-card" key={team}><div className="team-card-head"><h3>{team}</h3><span>{stats.filled}/{SLOTS.length}</span></div><div className="money-pair"><Metric label="RESTANTE" value={money(stats.remaining)} /><Metric label="MÁXIMA PUJA" value={money(stats.maxBid)} tone={tone} /></div><div className="stat-line"><span>Gastado <b>{money(stats.spent)}</b></span><span>Vacíos <b>{stats.empty}</b></span><span>Promedio <b>${stats.average.toFixed(1)}</b></span></div></article>; })}</div></>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <div className={`metric metric-strong ${tone ? `metric-${tone}` : ""}`}><span>{label}</span><b>{value}</b></div>; }
function NeedsTable({ teams, board }: { teams: string[]; board: Record<string, Pick[]> }) { const targets: Record<Position, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }; const map = new Map(PLAYERS.map((player) => [player.nombre.toLowerCase(), player.posicion])); return <div><div className="section-heading"><div><span className="eyebrow">Radar competitivo</span><h2>Qué le falta a cada equipo</h2></div></div><div className="table-wrap"><table className="needs-table"><thead><tr><th>Equipo</th>{POSITIONS.map((position) => <th key={position}>{position}</th>)}</tr></thead><tbody>{teams.map((team) => { const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<Position, number>; (board[team] || []).forEach((pick) => { const position = map.get(pick.jugador.toLowerCase()); if (position) counts[position]++; }); return <tr key={team}><th>{team}</th>{POSITIONS.map((position) => { const missing = Math.max(0, targets[position] - counts[position]); return <td key={position}>{missing === 0 ? <span className="complete">✓</span> : <span className="missing">{missing}</span>}</td>; })}</tr>; })}</tbody></table></div></div>; }
function LeagueSettings({ teams, onSave, onCancel }: { teams: string[]; onSave: (teams: string[]) => void; onCancel: () => void }) { const [draft, setDraft] = useState(teams); const changeCount = (count: number) => setDraft((current) => Array.from({ length: Math.min(16, Math.max(2, count)) }, (_, index) => current[index] || `Equipo ${index + 1}`)); return <div className="league-settings"><div className="settings-head"><div><span className="eyebrow">Configuración de liga</span><h2>Equipos y nombres</h2></div><label>CANTIDAD<input aria-label="Cantidad de equipos" type="number" min="2" max="16" value={draft.length} onChange={(event) => changeCount(Number(event.target.value))} /></label></div><div className="team-name-grid">{draft.map((team, index) => <label key={index}><span>{index + 1}</span><input aria-label={`Nombre del equipo ${index + 1}`} value={team} onChange={(event) => setDraft((current) => current.map((name, itemIndex) => itemIndex === index ? event.target.value : name))} /></label>)}</div><div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave(draft)}>Guardar equipos</button></div></div>; }


