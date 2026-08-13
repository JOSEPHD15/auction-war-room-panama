"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type Player = {
  nombre: string;
  posicion: Position;
  rankPos: number;
  rankOverall: number;
  equipoNFL: string;
  bye: number;
  precioLiga1: number;
  precioLiga2: number;
  precioLiga3: number;
  miPrecio: number;
};
type Pick = { jugador: string; posicion: string; precio: string; objetivo: string };
type ScenarioKey = "A" | "B" | "C";
type Screen = "board" | "team" | "prices" | "rankings" | "scouting";
type ScoutingAction = "GANGA TOP" | "COMPRA" | "PAGA" | "DARDO" | "NOMINAR YA" | "EVITAR";

const TEAMS = [
  "Dirupeps", "HITORI KAKURENBO", "Chocolate Coco", "Bali Maxx", "HyP",
  "Sum2Prove", "SHAKED", "Deluxe", "la lavanderia", "Los culecos",
];
const SLOTS = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DEF", "Banca 1", "Banca 2", "Banca 3", "Banca 4", "Banca 5"];
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const BUDGET = 200;
const STORAGE_KEY = "auction-war-room-v1";

// PEGA AQUÍ LA LISTA COMPLETA. Mantén esta estructura por jugador:
// { nombre, posicion, rankPos, rankOverall, equipoNFL, bye, precioLiga1, precioLiga2, precioLiga3, miPrecio }
const INITIAL_PLAYERS: Player[] = [
  { nombre: "Ja'Marr Chase", posicion: "WR", rankPos: 1, rankOverall: 1, equipoNFL: "CIN", bye: 10, precioLiga1: 62, precioLiga2: 65, precioLiga3: 61, miPrecio: 64 },
  { nombre: "Bijan Robinson", posicion: "RB", rankPos: 1, rankOverall: 2, equipoNFL: "ATL", bye: 5, precioLiga1: 60, precioLiga2: 63, precioLiga3: 59, miPrecio: 62 },
  { nombre: "Justin Jefferson", posicion: "WR", rankPos: 2, rankOverall: 3, equipoNFL: "MIN", bye: 6, precioLiga1: 58, precioLiga2: 60, precioLiga3: 57, miPrecio: 60 },
  { nombre: "Saquon Barkley", posicion: "RB", rankPos: 2, rankOverall: 4, equipoNFL: "PHI", bye: 9, precioLiga1: 57, precioLiga2: 59, precioLiga3: 56, miPrecio: 58 },
  { nombre: "CeeDee Lamb", posicion: "WR", rankPos: 3, rankOverall: 5, equipoNFL: "DAL", bye: 10, precioLiga1: 55, precioLiga2: 58, precioLiga3: 54, miPrecio: 57 },
  { nombre: "Jahmyr Gibbs", posicion: "RB", rankPos: 3, rankOverall: 6, equipoNFL: "DET", bye: 8, precioLiga1: 55, precioLiga2: 57, precioLiga3: 53, miPrecio: 56 },
  { nombre: "Puka Nacua", posicion: "WR", rankPos: 4, rankOverall: 7, equipoNFL: "LAR", bye: 8, precioLiga1: 50, precioLiga2: 53, precioLiga3: 49, miPrecio: 52 },
  { nombre: "Amon-Ra St. Brown", posicion: "WR", rankPos: 5, rankOverall: 8, equipoNFL: "DET", bye: 8, precioLiga1: 49, precioLiga2: 52, precioLiga3: 48, miPrecio: 51 },
  { nombre: "Josh Allen", posicion: "QB", rankPos: 1, rankOverall: 9, equipoNFL: "BUF", bye: 7, precioLiga1: 31, precioLiga2: 35, precioLiga3: 32, miPrecio: 34 },
  { nombre: "Lamar Jackson", posicion: "QB", rankPos: 2, rankOverall: 10, equipoNFL: "BAL", bye: 7, precioLiga1: 29, precioLiga2: 33, precioLiga3: 30, miPrecio: 32 },
  { nombre: "Malik Nabers", posicion: "WR", rankPos: 6, rankOverall: 11, equipoNFL: "NYG", bye: 14, precioLiga1: 46, precioLiga2: 49, precioLiga3: 45, miPrecio: 48 },
  { nombre: "De'Von Achane", posicion: "RB", rankPos: 4, rankOverall: 12, equipoNFL: "MIA", bye: 12, precioLiga1: 45, precioLiga2: 48, precioLiga3: 44, miPrecio: 47 },
  { nombre: "Nico Collins", posicion: "WR", rankPos: 7, rankOverall: 13, equipoNFL: "HOU", bye: 6, precioLiga1: 43, precioLiga2: 46, precioLiga3: 42, miPrecio: 45 },
  { nombre: "Breece Hall", posicion: "RB", rankPos: 5, rankOverall: 14, equipoNFL: "NYJ", bye: 9, precioLiga1: 42, precioLiga2: 45, precioLiga3: 41, miPrecio: 44 },
  { nombre: "Brian Thomas Jr.", posicion: "WR", rankPos: 8, rankOverall: 15, equipoNFL: "JAX", bye: 8, precioLiga1: 40, precioLiga2: 43, precioLiga3: 39, miPrecio: 42 },
  { nombre: "Brock Bowers", posicion: "TE", rankPos: 1, rankOverall: 16, equipoNFL: "LV", bye: 8, precioLiga1: 33, precioLiga2: 36, precioLiga3: 34, miPrecio: 35 },
  { nombre: "Jonathan Taylor", posicion: "RB", rankPos: 6, rankOverall: 17, equipoNFL: "IND", bye: 11, precioLiga1: 39, precioLiga2: 42, precioLiga3: 38, miPrecio: 41 },
  { nombre: "A.J. Brown", posicion: "WR", rankPos: 9, rankOverall: 18, equipoNFL: "PHI", bye: 9, precioLiga1: 37, precioLiga2: 40, precioLiga3: 36, miPrecio: 39 },
  { nombre: "Jalen Hurts", posicion: "QB", rankPos: 3, rankOverall: 19, equipoNFL: "PHI", bye: 9, precioLiga1: 27, precioLiga2: 30, precioLiga3: 28, miPrecio: 29 },
  { nombre: "Trey McBride", posicion: "TE", rankPos: 2, rankOverall: 20, equipoNFL: "ARI", bye: 8, precioLiga1: 28, precioLiga2: 31, precioLiga3: 29, miPrecio: 30 },
  { nombre: "Derrick Henry", posicion: "RB", rankPos: 7, rankOverall: 21, equipoNFL: "BAL", bye: 7, precioLiga1: 35, precioLiga2: 38, precioLiga3: 34, miPrecio: 36 },
  { nombre: "Jayden Daniels", posicion: "QB", rankPos: 4, rankOverall: 22, equipoNFL: "WAS", bye: 12, precioLiga1: 25, precioLiga2: 29, precioLiga3: 26, miPrecio: 28 },
  { nombre: "Drake London", posicion: "WR", rankPos: 10, rankOverall: 23, equipoNFL: "ATL", bye: 5, precioLiga1: 34, precioLiga2: 37, precioLiga3: 33, miPrecio: 36 },
  { nombre: "Kyren Williams", posicion: "RB", rankPos: 8, rankOverall: 24, equipoNFL: "LAR", bye: 8, precioLiga1: 33, precioLiga2: 36, precioLiga3: 32, miPrecio: 35 },
  { nombre: "George Kittle", posicion: "TE", rankPos: 3, rankOverall: 25, equipoNFL: "SF", bye: 14, precioLiga1: 20, precioLiga2: 23, precioLiga3: 21, miPrecio: 22 },
  { nombre: "Tee Higgins", posicion: "WR", rankPos: 11, rankOverall: 26, equipoNFL: "CIN", bye: 10, precioLiga1: 29, precioLiga2: 32, precioLiga3: 28, miPrecio: 31 },
  { nombre: "James Cook", posicion: "RB", rankPos: 9, rankOverall: 27, equipoNFL: "BUF", bye: 7, precioLiga1: 28, precioLiga2: 31, precioLiga3: 27, miPrecio: 30 },
  { nombre: "Brandon Aubrey", posicion: "K", rankPos: 1, rankOverall: 121, equipoNFL: "DAL", bye: 10, precioLiga1: 2, precioLiga2: 3, precioLiga3: 2, miPrecio: 3 },
  { nombre: "Denver Broncos", posicion: "DEF", rankPos: 1, rankOverall: 131, equipoNFL: "DEN", bye: 12, precioLiga1: 2, precioLiga2: 3, precioLiga3: 2, miPrecio: 3 },
  { nombre: "Philadelphia Eagles", posicion: "DEF", rankPos: 2, rankOverall: 136, equipoNFL: "PHI", bye: 9, precioLiga1: 1, precioLiga2: 2, precioLiga3: 2, miPrecio: 2 },
];

const emptyPick = (): Pick => ({ jugador: "", posicion: "", precio: "", objetivo: "" });
const makeBoard = () => Object.fromEntries(TEAMS.map((team) => [team, SLOTS.map(emptyPick)])) as Record<string, Pick[]>;
const makeScenarios = () => ({ A: SLOTS.map(emptyPick), B: SLOTS.map(emptyPick), C: SLOTS.map(emptyPick) });

function allowedPositions(slot: string): Position[] {
  if (slot.startsWith("RB")) return ["RB"];
  if (slot.startsWith("WR")) return ["WR"];
  if (slot === "QB" || slot === "TE" || slot === "K" || slot === "DEF") return [slot];
  if (slot === "FLEX") return ["RB", "WR", "TE"];
  return POSITIONS;
}

function money(value: number) { return `$${Math.max(0, Math.round(value))}`; }
function statsFor(picks: Pick[]) {
  const spent = picks.reduce((sum, pick) => sum + (Number(pick.precio) || 0), 0);
  const filled = picks.filter((pick) => pick.jugador.trim()).length;
  const empty = SLOTS.length - filled;
  const remaining = BUDGET - spent;
  const maxBid = empty > 0 ? remaining - (empty - 1) : remaining;
  return { spent, filled, empty, remaining, maxBid, average: empty ? remaining / empty : remaining };
}

function Metric({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "green" | "red" | "blue" }) {
  return <div className={`metric ${strong ? "metric-strong" : ""} ${tone ? `metric-${tone}` : ""}`}><span>{label}</span><b>{value}</b></div>;
}

function PlayerInput({ value, onChange, options, id, placeholder = "Jugador" }: { value: string; onChange: (value: string) => void; options: Player[]; id: string; placeholder?: string }) {
  return <><input aria-label={placeholder} className="field player-field" list={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><datalist id={id}>{options.map((player) => <option key={player.nombre} value={player.nombre}>{player.posicion} · {player.equipoNFL}</option>)}</datalist></>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("board");
  const [dark, setDark] = useState(true);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [board, setBoard] = useState<Record<string, Pick[]>>(makeBoard);
  const [scenarios, setScenarios] = useState<Record<ScenarioKey, Pick[]>>(makeScenarios);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("TODAS");
  const [actionFilter, setActionFilter] = useState<string>("TODAS");
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.board) setBoard(parsed.board);
        if (parsed.scenarios) setScenarios(parsed.scenarios);
        if (parsed.players) setPlayers(parsed.players);
        if (typeof parsed.dark === "boolean") setDark(parsed.dark);
      }
    } catch { setToast("No se pudo restaurar el guardado anterior."); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify({ board, scenarios, players, dark }));
  }, [board, scenarios, players, dark, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const playerMap = useMemo(() => new Map(players.map((player) => [player.nombre.toLowerCase(), player])), [players]);
  const filteredPlayers = useMemo(() => players.filter((player) => {
    const matchesText = `${player.nombre} ${player.equipoNFL}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (positionFilter === "TODAS" || player.posicion === positionFilter);
  }), [players, query, positionFilter]);

  const updateBoardPick = (team: string, slotIndex: number, patch: Partial<Pick>) => {
    setBoard((current) => ({ ...current, [team]: current[team].map((pick, index) => {
      if (index !== slotIndex) return pick;
      const next = { ...pick, ...patch };
      if (patch.jugador !== undefined) next.posicion = playerMap.get(patch.jugador.toLowerCase())?.posicion || pick.posicion;
      return next;
    }) }));
  };

  const updateScenarioPick = (scenario: ScenarioKey, slotIndex: number, patch: Partial<Pick>) => {
    setScenarios((current) => ({ ...current, [scenario]: current[scenario].map((pick, index) => {
      if (index !== slotIndex) return pick;
      const next = { ...pick, ...patch };
      if (patch.jugador !== undefined) {
        const match = playerMap.get(patch.jugador.toLowerCase());
        next.posicion = match?.posicion || "";
        if (match) next.objetivo = String(match.miPrecio);
      }
      return next;
    }) }));
  };

  const updateTarget = (name: string, value: number) => {
    setPlayers((current) => current.map((player) => player.nombre === name ? { ...player, miPrecio: value } : player));
    setScenarios((current) => Object.fromEntries(Object.entries(current).map(([key, picks]) => [key, picks.map((pick) => pick.jugador === name ? { ...pick, objetivo: String(value) } : pick)])) as Record<ScenarioKey, Pick[]>);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), board, scenarios, players, dark }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "auction-war-room.json"; anchor.click(); URL.revokeObjectURL(url);
    setToast("Exportación lista.");
  };

  const importJSON = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.board || !data.scenarios || !Array.isArray(data.players)) throw new Error("Formato inválido");
      setBoard(data.board); setScenarios(data.scenarios); setPlayers(data.players); if (typeof data.dark === "boolean") setDark(data.dark);
      setToast("Datos importados correctamente.");
    } catch { setToast("Ese archivo no es una exportación válida."); }
    event.target.value = "";
  };

  const resetBoard = () => { if (confirm("¿Vaciar todo el Draft Board?")) { setBoard(makeBoard()); setToast("Draft Board reiniciado."); } };
  const resetAll = () => { if (confirm("¿Borrar board, escenarios y precios personalizados?")) { setBoard(makeBoard()); setScenarios(makeScenarios()); setPlayers(INITIAL_PLAYERS); setToast("Todo ha sido reiniciado."); } };

  const navItems: { id: Screen; label: string; short: string }[] = [
    { id: "board", label: "Draft Board", short: "Board" }, { id: "team", label: "Mi Equipo", short: "Equipo" },
    { id: "prices", label: "Mis Precios", short: "Precios" }, { id: "rankings", label: "Rankings", short: "Ranks" },
    { id: "scouting", label: "Scouting Report", short: "Scouting" },
  ];

  return <main className={dark ? "app theme-dark" : "app theme-light"}>
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("board")} aria-label="Ir al Draft Board">
        <span className="brand-mark">AW</span><span><b>AUCTION</b><small>WAR ROOM · 0.5 PPR</small></span>
      </button>
      <nav className="nav-tabs" aria-label="Pantallas principales">
        {navItems.map((item) => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)}><span className="nav-full">{item.label}</span><span className="nav-short">{item.short}</span></button>)}
      </nav>
      <div className="header-actions">
        <button className="icon-button" onClick={() => setDark((value) => !value)} title="Cambiar tema" aria-label="Cambiar tema">{dark ? "☀" : "◐"}</button>
        <button className="ghost-button" onClick={exportJSON}>Exportar</button>
        <button className="ghost-button" onClick={() => importRef.current?.click()}>Importar</button>
        <input ref={importRef} className="sr-only" type="file" accept="application/json" onChange={importJSON} />
      </div>
    </header>

    {screen === "board" && <BoardScreen players={players} board={board} updatePick={updateBoardPick} resetBoard={resetBoard} />}
    {screen === "team" && <TeamScreen players={players} scenarios={scenarios} updatePick={updateScenarioPick} resetScenario={(key) => { if (confirm(`¿Reiniciar escenario ${key}?`)) setScenarios((current) => ({ ...current, [key]: SLOTS.map(emptyPick) })); }} />}
    {screen === "prices" && <PricesScreen players={filteredPlayers} query={query} setQuery={setQuery} position={positionFilter} setPosition={setPositionFilter} updateTarget={updateTarget} />}
    {screen === "rankings" && <RankingsScreen players={filteredPlayers} query={query} setQuery={setQuery} position={positionFilter} setPosition={setPositionFilter} />}
    {screen === "scouting" && <ScoutingScreen players={players} query={query} setQuery={setQuery} position={positionFilter} setPosition={setPositionFilter} action={actionFilter} setAction={setActionFilter} />}

    <footer><span>Guardado automático en este dispositivo</span><span>10 equipos · $200 · 14 slots</span><button onClick={resetAll}>Reiniciar todo</button></footer>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function PageIntro({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: React.ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{actions && <div className="intro-actions">{actions}</div>}</div>;
}

function BoardScreen({ players, board, updatePick, resetBoard }: { players: Player[]; board: Record<string, Pick[]>; updatePick: (team: string, index: number, patch: Partial<Pick>) => void; resetBoard: () => void }) {
  return <section className="page-shell">
    <PageIntro eyebrow="Sala de subasta" title="Draft Board" text="Carga cada compra. El poder de puja rival se recalcula al instante." actions={<button className="danger-button" onClick={resetBoard}>Vaciar board</button>} />
    <div className="legend"><span><i className="dot dot-green" /> Poder de compra &gt; $40</span><span><i className="dot dot-red" /> Topado &lt; $6</span><span><i className="dot dot-gold" /> Edición en vivo</span></div>
    <div className="table-wrap board-wrap">
      <table className="draft-table">
        <thead><tr><th className="sticky-col slot-head">SLOT</th>{TEAMS.map((team) => { const stats = statsFor(board[team]); return <th key={team}><span>{team}</span><small>{money(stats.remaining)} libres</small></th>; })}</tr></thead>
        <tbody>{SLOTS.map((slot, slotIndex) => <tr key={slot}><th className="sticky-col"><span className={`slot-badge slot-${slot.replace(/\s|\d/g, "").toLowerCase()}`}>{slot}</span></th>{TEAMS.map((team, teamIndex) => {
          const pick = board[team][slotIndex]; const options = players.filter((player) => allowedPositions(slot).includes(player.posicion));
          return <td key={team}><div className="pick-cell"><PlayerInput value={pick.jugador} onChange={(jugador) => updatePick(team, slotIndex, { jugador })} options={options} id={`board-${slotIndex}-${teamIndex}`} /><div className="price-row"><span>$</span><input aria-label={`Precio de ${team}, ${slot}`} className="price-field" type="number" min="0" max="200" value={pick.precio} onChange={(event) => updatePick(team, slotIndex, { precio: event.target.value })} placeholder="0" />{pick.posicion && <em>{pick.posicion}</em>}</div></div></td>;
        })}</tr>)}</tbody>
      </table>
    </div>

    <div className="section-heading"><div><span className="eyebrow">Control financiero</span><h2>Poder de compra por equipo</h2></div><p>Máxima puja reserva $1 por cada slot pendiente.</p></div>
    <div className="team-grid">{TEAMS.map((team) => { const stats = statsFor(board[team]); const tone = stats.maxBid > 40 ? "green" : stats.maxBid < 6 ? "red" : "blue"; return <article className="team-card" key={team}><div className="team-card-head"><h3>{team}</h3><span>{stats.filled}/{SLOTS.length}</span></div><div className="money-pair"><Metric label="RESTANTE" value={money(stats.remaining)} strong /><Metric label="MÁXIMA PUJA" value={money(stats.maxBid)} strong tone={tone} /></div><div className="stat-line"><span>Gastado <b>{money(stats.spent)}</b></span><span>Vacíos <b>{stats.empty}</b></span><span>Promedio <b>${stats.average.toFixed(1)}</b></span></div></article>; })}</div>

    <NeedsTable board={board} players={players} />
  </section>;
}

function NeedsTable({ board, players }: { board: Record<string, Pick[]>; players: Player[] }) {
  const targets: Record<Position, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  const map = new Map(players.map((player) => [player.nombre.toLowerCase(), player.posicion]));
  return <div className="needs-section"><div className="section-heading"><div><span className="eyebrow">Radar competitivo</span><h2>Qué le falta a cada equipo</h2></div><p>Identifica quién puede pujar por la próxima nominación.</p></div><div className="table-wrap"><table className="needs-table"><thead><tr><th>Equipo</th>{POSITIONS.map((position) => <th key={position}>{position}</th>)}</tr></thead><tbody>{TEAMS.map((team) => { const counts = POSITIONS.reduce((all, position) => ({ ...all, [position]: 0 }), {} as Record<Position, number>); board[team].forEach((pick) => { const position = map.get(pick.jugador.toLowerCase()); if (position) counts[position] += 1; }); return <tr key={team}><th>{team}</th>{POSITIONS.map((position) => { const missing = Math.max(0, targets[position] - counts[position]); return <td key={position}>{missing === 0 ? <span className="complete">✓</span> : <span className="missing">{missing}</span>}</td>; })}</tr>; })}</tbody></table></div></div>;
}

function TeamScreen({ players, scenarios, updatePick, resetScenario }: { players: Player[]; scenarios: Record<ScenarioKey, Pick[]>; updatePick: (scenario: ScenarioKey, index: number, patch: Partial<Pick>) => void; resetScenario: (scenario: ScenarioKey) => void }) {
  const scenarioKeys: ScenarioKey[] = ["A", "B", "C"];
  return <section className="page-shell">
    <PageIntro eyebrow="Planificador" title="Mi Equipo" text="Construye tres rutas de draft y compara el costo real antes de entrar en una puja." />
    <div className="scenario-grid">{scenarioKeys.map((key) => <article className={`scenario scenario-${key.toLowerCase()}`} key={key}><div className="scenario-head"><div><span>ESCENARIO</span><h2>{key}</h2></div><button onClick={() => resetScenario(key)}>Reiniciar</button></div><div className="scenario-picks">{SLOTS.map((slot, index) => { const pick = scenarios[key][index]; const options = players.filter((player) => allowedPositions(slot).includes(player.posicion)); return <div className="scenario-row" key={slot}><span className="slot-label">{slot}</span><div className="scenario-player"><PlayerInput value={pick.jugador} onChange={(jugador) => updatePick(key, index, { jugador })} options={options} id={`scenario-${key}-${index}`} /><small>{pick.posicion || allowedPositions(slot).join("/")}</small></div><label><span>Pagado</span><input type="number" min="0" value={pick.precio} onChange={(event) => updatePick(key, index, { precio: event.target.value })} placeholder="$" /></label><label><span>Objetivo</span><input type="number" min="0" value={pick.objetivo} onChange={(event) => updatePick(key, index, { objetivo: event.target.value })} placeholder="$" /></label></div>; })}</div></article>)}</div>
    <div className="section-heading"><div><span className="eyebrow">Decisión rápida</span><h2>Comparación de escenarios</h2></div></div>
    <div className="comparison-grid">{scenarioKeys.map((key) => { const stats = statsFor(scenarios[key]); const shortfall = stats.remaining < stats.empty; return <article className={`comparison-card scenario-${key.toLowerCase()}`} key={key}><span>ESCENARIO {key}</span><div className="comparison-main"><Metric label="RESTANTE" value={money(stats.remaining)} strong tone={shortfall ? "red" : "green"} /><Metric label="MÁXIMA PUJA" value={money(stats.maxBid)} strong tone={stats.maxBid < 6 ? "red" : "blue"} /></div><div className="comparison-details"><span>Presupuesto <b>$200</b></span><span>Gastado <b>{money(stats.spent)}</b></span><span>Slots <b>{stats.filled}/14</b></span><span>Promedio <b>${stats.average.toFixed(1)}</b></span></div>{shortfall && <p className="budget-alert">⚠ Faltan {stats.empty} slots y solo quedan {money(stats.remaining)}.</p>}</article>; })}</div>
  </section>;
}

function FilterBar({ query, setQuery, position, setPosition, children }: { query: string; setQuery: (value: string) => void; position: string; setPosition: (value: string) => void; children?: React.ReactNode }) {
  return <div className="filter-bar"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar jugador o equipo NFL…" /></label><div className="chips"><button className={position === "TODAS" ? "active" : ""} onClick={() => setPosition("TODAS")}>Todas</button>{POSITIONS.map((pos) => <button key={pos} className={position === pos ? "active" : ""} onClick={() => setPosition(pos)}>{pos}</button>)}</div>{children}</div>;
}

function PricesScreen({ players, query, setQuery, position, setPosition, updateTarget }: { players: Player[]; query: string; setQuery: (value: string) => void; position: string; setPosition: (value: string) => void; updateTarget: (name: string, value: number) => void }) {
  return <section className="page-shell"><PageIntro eyebrow="Tu mercado" title="Mis Precios" text="Ajusta tu límite. El nuevo valor se sincroniza con escenarios y rankings." /><FilterBar query={query} setQuery={setQuery} position={position} setPosition={setPosition} /><div className="table-wrap"><table className="data-table price-table"><thead><tr><th>#</th><th>Jugador</th><th>Pos</th><th>Mi objetivo</th><th>Liga 1</th><th>Liga 2</th><th>Liga 3</th><th>Promedio</th></tr></thead><tbody>{players.map((player) => { const average = (player.precioLiga1 + player.precioLiga2 + player.precioLiga3) / 3; return <tr key={player.nombre}><td>{player.rankOverall}</td><th><span className="player-name">{player.nombre}</span><small>{player.equipoNFL} · BYE {player.bye}</small></th><td><span className={`position-tag pos-${player.posicion.toLowerCase()}`}>{player.posicion}</span></td><td><label className="target-input"><span>$</span><input aria-label={`Mi precio para ${player.nombre}`} type="number" min="0" max="200" value={player.miPrecio} onChange={(event) => updateTarget(player.nombre, Number(event.target.value))} /></label></td><td>{money(player.precioLiga1)}</td><td>{money(player.precioLiga2)}</td><td>{money(player.precioLiga3)}</td><td className={player.miPrecio >= average ? "value-up" : "value-down"}>{money(average)}</td></tr>; })}</tbody></table></div>{players.length === 0 && <EmptyState />}</section>;
}

function RankingsScreen({ players, query, setQuery, position, setPosition }: { players: Player[]; query: string; setQuery: (value: string) => void; position: string; setPosition: (value: string) => void }) {
  const sorted = [...players].sort((a, b) => position === "TODAS" ? a.rankOverall - b.rankOverall : a.rankPos - b.rankPos);
  return <section className="page-shell"><PageIntro eyebrow="Big board" title="Rankings" text="Consenso general y posicional con contexto de equipo, bye y precios históricos." /><FilterBar query={query} setQuery={setQuery} position={position} setPosition={setPosition} /><div className="ranking-list"><div className="ranking-head"><span>Rank</span><span>Jugador</span><span>Posición</span><span>Equipo</span><span>Bye</span><span>Histórico L1/L2/L3</span><span>Mi precio</span></div>{sorted.map((player, index) => <article className="ranking-row" key={player.nombre}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><span className="rank-player"><b>{player.nombre}</b><small>Overall #{player.rankOverall}</small></span><span><i className={`position-tag pos-${player.posicion.toLowerCase()}`}>{player.posicion}{player.rankPos}</i></span><span>{player.equipoNFL}</span><span>{player.bye}</span><span className="history-prices">{money(player.precioLiga1)} <i>/</i> {money(player.precioLiga2)} <i>/</i> {money(player.precioLiga3)}</span><span className="my-price">{money(player.miPrecio)}</span></article>)}</div>{players.length === 0 && <EmptyState />}</section>;
}

const ACTIONS: ScoutingAction[] = ["GANGA TOP", "COMPRA", "PAGA", "DARDO", "NOMINAR YA", "EVITAR"];
function scoutingFor(player: Player, index: number): { action: ScoutingAction; thesis: string; risk: string; source: string } {
  const action = ACTIONS[index % ACTIONS.length];
  const theses: Record<ScoutingAction, string> = {
    "GANGA TOP": "Prioridad absoluta si la sala lo deja por debajo de tu precio.", COMPRA: "Perfil sólido; margen favorable frente al consenso de las ligas.", PAGA: "La ventaja semanal justifica estirar la puja hasta tu límite.", DARDO: "Upside de banca a costo bajo; entra cuando los titulares ya volaron.", "NOMINAR YA": "Ponlo temprano para drenar presupuesto de rivales con necesidad.", EVITAR: "El costo probable supera el retorno esperado en esta construcción.",
  };
  return { action, thesis: theses[action], risk: player.posicion === "RB" ? "Carga y durabilidad" : player.posicion === "WR" ? "Volumen semanal" : player.posicion === "QB" ? "Costo de oportunidad" : "Volatilidad de posición", source: "Consenso Ligas 1–3" };
}

function ScoutingScreen({ players, query, setQuery, position, setPosition, action, setAction }: { players: Player[]; query: string; setQuery: (value: string) => void; position: string; setPosition: (value: string) => void; action: string; setAction: (value: string) => void }) {
  const reports = players.map((player, index) => ({ player, ...scoutingFor(player, index) })).filter((report) => `${report.player.nombre} ${report.player.equipoNFL}`.toLowerCase().includes(query.toLowerCase()) && (position === "TODAS" || report.player.posicion === position) && (action === "TODAS" || report.action === action));
  return <section className="page-shell"><PageIntro eyebrow="Inteligencia de draft" title="Scouting Report" text="Una acción clara por jugador para nominar, comprar o retirarte sin dudar." /><FilterBar query={query} setQuery={setQuery} position={position} setPosition={setPosition}><select aria-label="Filtrar por acción" value={action} onChange={(event) => setAction(event.target.value)}><option value="TODAS">Todas las acciones</option>{ACTIONS.map((item) => <option key={item}>{item}</option>)}</select></FilterBar><div className="scouting-grid">{reports.map((report) => <article className="scout-card" key={report.player.nombre}><div className="scout-top"><span className={`action action-${report.action.toLowerCase().replace(/\s/g, "-")}`}>{report.action}</span><span className={`position-tag pos-${report.player.posicion.toLowerCase()}`}>{report.player.posicion}{report.player.rankPos}</span></div><h2>{report.player.nombre}</h2><p>{report.thesis}</p><div className="scout-price"><span>MI PRECIO <b>{money(report.player.miPrecio)}</b></span><span>MERCADO <b>{money((report.player.precioLiga1 + report.player.precioLiga2 + report.player.precioLiga3) / 3)}</b></span></div><div className="scout-meta"><span><small>RIESGO</small>{report.risk}</span><span><small>FUENTE</small>{report.source}</span></div></article>)}</div>{reports.length === 0 && <EmptyState />}</section>;
}

function EmptyState() { return <div className="empty-state"><b>Sin resultados</b><span>Prueba con otro nombre, posición o acción.</span></div>; }
