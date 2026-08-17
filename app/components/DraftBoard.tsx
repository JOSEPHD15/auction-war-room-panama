"use client";

import { useEffect, useState } from "react";
import playerCatalog from "../players.json";
import { finalizeDraft, renameTeams, reopenDraft, resetPurchases, startDraft, updateLeagueConfig } from "../lib/draftStatus";
import { allowedPositions, money, POSITIONS, statsFor } from "../lib/formulas";
import { makeId } from "../lib/ids";
import { applyPurchase, editPurchase, undoLastPurchase } from "../lib/purchaseEngine";
import { normalizedPlayerName } from "../lib/text";
import type { League, Player, Position, Purchase, RosterCounts, Slot, Team } from "../lib/types";

const PLAYERS = playerCatalog as Player[];

function draftedNames(league: League): Set<string> {
  return new Set(league.purchases.map((purchase) => normalizedPlayerName(purchase.playerName)));
}

function purchaseFor(league: League, teamId: string, slotId: string): Purchase | null {
  return league.purchases.find((purchase) => purchase.teamId === teamId && purchase.slotId === slotId) || null;
}

function PlayerInput({ value, onChange, options, id }: { value: string; onChange: (value: string) => void; options: Player[]; id: string }) {
  return (
    <>
      <input aria-label="Jugador" className="field player-field" list={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Jugador" />
      <datalist id={id}>{options.map((player) => <option key={`${player.nombre}-${player.posicion}`} value={player.nombre}>{player.posicion}</option>)}</datalist>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`metric metric-strong ${tone ? `metric-${tone}` : ""}`}><span>{label}</span><b>{value}</b></div>;
}

export default function DraftBoard({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const apply = (result: { ok: true; league: League } | { ok: false; error: string }, successMessage?: string) => {
    if (!result.ok) { setToast(result.error); return false; }
    onChange(result.league);
    if (successMessage) setToast(successMessage);
    return true;
  };

  const registerPurchase = (playerName: string, teamId: string, price: number, slotId?: string) => apply(applyPurchase(league, { teamId, playerName, price, slotId }, makeId("op")), `${playerName} registrado.`);
  const applyEdit = (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => apply(editPurchase(league, purchaseId, patch, makeId("op")), "Compra actualizada.");
  const undo = () => apply(undoLastPurchase(league, makeId("op")));

  const resetBoard = () => { if (confirm("¿Vaciar todas las compras de esta liga? El historial de auditoría se conserva.")) apply({ ok: true, league: resetPurchases(league) }, "Compras reiniciadas."); };
  const startNow = () => apply(startDraft(league), "Draft iniciado.");
  const finalizeNow = () => { if (confirm("¿Finalizar el draft? Se bloquearán nuevas compras.")) apply(finalizeDraft(league), "Draft finalizado."); };
  const reopenNow = () => { if (confirm("¿Reabrir el draft? Podrás volver a registrar y editar compras.")) apply(reopenDraft(league), "Draft reabierto."); };

  const drafted = draftedNames(league);
  const lastPurchase = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

  return (
    <section className="page-shell">
      <div className="page-intro">
        <div><span className="eyebrow">Sala de subasta</span><h1>Draft Board</h1><p>Compras, presupuestos y poder de puja de toda la liga en tiempo real.</p></div>
        <div className="intro-actions">
          <button className="ghost-button" onClick={() => setConfigOpen((value) => !value)}>⚙ Editar liga</button>
          {league.status !== "FINALIZADO" && <button className="danger-button" onClick={resetBoard}>Vaciar compras</button>}
        </div>
      </div>

      <DraftStatusBar league={league} onStart={startNow} onFinalize={finalizeNow} onReopen={reopenNow} />

      {configOpen && (
        league.status === "PRE-DRAFT"
          ? <LeagueConfigForm league={league} onSave={(patch) => { if (apply(updateLeagueConfig(league, patch), "Liga actualizada.")) setConfigOpen(false); }} onCancel={() => setConfigOpen(false)} />
          : <TeamRenameForm league={league} onSave={(names) => { onChange(renameTeams(league, names)); setToast("Equipos renombrados."); setConfigOpen(false); }} onCancel={() => setConfigOpen(false)} />
      )}

      <LastPurchase league={league} lastPurchase={lastPurchase} drafted={drafted} onRegister={registerPurchase} onUndo={undo} canUndo={league.purchases.length > 0 && league.status === "LIVE"} />

      <div className="legend"><span><i className="dot dot-green" /> Poder de compra &gt; $40</span><span><i className="dot dot-red" /> Topado &lt; $6</span><span><i className="dot dot-gold" /> {PLAYERS.length} jugadores · duplicados bloqueados</span></div>

      <DraftTable league={league} onRegister={registerPurchase} onEdit={applyEdit} />
      <AvailablePlayers drafted={drafted} />
      <PurchaseHistory league={league} onEdit={applyEdit} />
      <TeamControl league={league} />
      <NeedsTable league={league} />

      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}

function DraftStatusBar({ league, onStart, onFinalize, onReopen }: { league: League; onStart: () => void; onFinalize: () => void; onReopen: () => void }) {
  if (league.status === "PRE-DRAFT") return <div className="draft-status-bar"><span className="status-pill status-pre">PRE-DRAFT</span><p>Configura equipos, presupuesto y roster, luego inicia el draft para habilitar las compras.</p><button className="save-button" onClick={onStart}>▶ Iniciar Draft</button></div>;
  if (league.status === "LIVE") return <div className="draft-status-bar"><span className="status-pill status-live">LIVE</span><p>El draft está en curso.</p><button className="danger-button" onClick={onFinalize}>Finalizar Draft</button></div>;
  return <div className="draft-status-bar"><span className="status-pill status-done">FINALIZADO</span><p>Draft finalizado: el tablero queda de solo lectura, pero puedes exportarlo.</p><button className="ghost-button" onClick={onReopen}>Reabrir Draft</button></div>;
}

function LeagueConfigForm({ league, onSave, onCancel }: { league: League; onSave: (patch: { name: string; season: string; teamNames: string[]; budget: number; minimumBid: number; roster: RosterCounts }) => void; onCancel: () => void }) {
  const [name, setName] = useState(league.name);
  const [season, setSeason] = useState(league.season);
  const [teamNames, setTeamNames] = useState(league.teams.map((team) => team.name));
  const [budget, setBudget] = useState(league.config.budget);
  const [minimumBid, setMinimumBid] = useState(league.config.minimumBid);
  const [roster, setRoster] = useState<RosterCounts>(league.config.roster);

  const changeTeamCount = (count: number) => setTeamNames((current) => Array.from({ length: Math.min(16, Math.max(2, count)) }, (_, index) => current[index] || `Equipo ${index + 1}`));
  const setRosterField = (key: keyof RosterCounts, value: number) => setRoster((current) => ({ ...current, [key]: Math.max(0, value) }));

  return (
    <div className="league-settings">
      <div className="settings-head"><div><span className="eyebrow">Configuración de liga</span><h2>{league.name}</h2></div></div>
      <div className="field-grid">
        <label className="form-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="form-field"><span>Temporada</span><input value={season} onChange={(event) => setSeason(event.target.value)} /></label>
        <label className="form-field"><span>Equipos</span><input type="number" min="2" max="16" value={teamNames.length} onChange={(event) => changeTeamCount(Number(event.target.value))} /></label>
        <label className="form-field"><span>Presupuesto</span><input type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value) || 1))} /></label>
        <label className="form-field"><span>Puja mínima</span><input type="number" min="0" value={minimumBid} onChange={(event) => setMinimumBid(Math.max(0, Number(event.target.value) || 0))} /></label>
      </div>
      <div className="team-name-grid">{teamNames.map((teamName, index) => <label key={index}><span>{index + 1}</span><input value={teamName} onChange={(event) => setTeamNames((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>)}</div>
      <div className="field-grid">
        {(["QB", "RB", "WR", "TE", "K", "DEF"] as const).map((position) => <label className="form-field" key={position}><span>{position}</span><input type="number" min="0" value={roster[position]} onChange={(event) => setRosterField(position, Number(event.target.value) || 0)} /></label>)}
        <label className="form-field"><span>FLEX</span><input type="number" min="0" value={roster.FLEX} onChange={(event) => setRosterField("FLEX", Number(event.target.value) || 0)} /></label>
        <label className="form-field"><span>BANCA</span><input type="number" min="0" value={roster.BENCH} onChange={(event) => setRosterField("BENCH", Number(event.target.value) || 0)} /></label>
      </div>
      <div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave({ name, season, teamNames, budget, minimumBid, roster })}>Guardar</button></div>
    </div>
  );
}

function TeamRenameForm({ league, onSave, onCancel }: { league: League; onSave: (names: Record<string, string>) => void; onCancel: () => void }) {
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(league.teams.map((team) => [team.id, team.name])));
  return (
    <div className="league-settings">
      <div className="settings-head"><div><span className="eyebrow">Renombrar equipos</span><h2>{league.name}</h2></div><p>El presupuesto y el roster solo se pueden ajustar en PRE-DRAFT.</p></div>
      <div className="team-name-grid">{league.teams.map((team, index) => <label key={team.id}><span>{index + 1}</span><input value={names[team.id] || ""} onChange={(event) => setNames((current) => ({ ...current, [team.id]: event.target.value }))} /></label>)}</div>
      <div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave(names)}>Guardar</button></div>
    </div>
  );
}

function LastPurchase({ league, lastPurchase, drafted, onRegister, onUndo, canUndo }: { league: League; lastPurchase: Purchase | null; drafted: Set<string>; onRegister: (playerName: string, teamId: string, price: number) => boolean; onUndo: () => void; canUndo: boolean }) {
  const [player, setPlayer] = useState("");
  const [teamId, setTeamId] = useState(league.teams[0]?.id || "");
  const [price, setPrice] = useState("");
  const available = PLAYERS.filter((item) => !drafted.has(normalizedPlayerName(item.nombre)));
  const team = league.teams.find((item) => item.id === teamId);
  const slot = lastPurchase ? league.config.slots.find((item) => item.id === lastPurchase.slotId) : null;
  const submit = () => { if (price !== "" && onRegister(player, teamId, Number(price))) { setPlayer(""); setPrice(""); } };
  return (
    <article className={`last-pick-hero ${lastPurchase ? "has-pick" : ""}`}>
      <div className="last-pick-label"><i /> ÚLTIMA COMPRA</div>
      <div className="last-pick-main">
        <div><span>{lastPurchase?.position || "EN ESPERA"}</span><h2>{lastPurchase?.playerName || "Esperando la primera compra"}</h2><p>{lastPurchase ? `${league.teams.find((item) => item.id === lastPurchase.teamId)?.name || ""} · ${slot?.label || ""}` : "También puedes registrar la compra directamente aquí."}</p></div>
        <strong>{lastPurchase ? money(lastPurchase.price) : "$—"}</strong>
      </div>
      <div className="quick-purchase">
        <label>JUGADOR<PlayerInput value={player} onChange={setPlayer} options={available} id="quick-player-list" /></label>
        <label>EQUIPO<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>PRECIO<div className="quick-price"><span>$</span><input type="number" min={league.config.minimumBid} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" onKeyDown={(event) => { if (event.key === "Enter" && player && team && price !== "") submit(); }} /></div></label>
        <button className="register-button" onClick={submit} disabled={league.status !== "LIVE"}>VENDIDO</button>
        <button className="undo-button" disabled={!canUndo} onClick={onUndo}>↶ Deshacer</button>
      </div>
    </article>
  );
}

function BoardCell({ league, team, slot, purchase, onRegister, onEdit }: { league: League; team: Team; slot: Slot; purchase: Purchase | null; onRegister: (playerName: string, teamId: string, price: number, slotId?: string) => boolean; onEdit: (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => boolean }) {
  const [jugador, setJugador] = useState(purchase?.playerName || "");
  const [precio, setPrecio] = useState(purchase ? String(purchase.price) : "");

  useEffect(() => { setJugador(purchase?.playerName || ""); setPrecio(purchase ? String(purchase.price) : ""); }, [purchase?.id, purchase?.playerName, purchase?.price]);

  const currentNormalized = normalizedPlayerName(jugador);
  const drafted = draftedNames(league);
  const options = PLAYERS.filter((item) => allowedPositions(slot).includes(item.posicion) && (!drafted.has(normalizedPlayerName(item.nombre)) || normalizedPlayerName(item.nombre) === currentNormalized));

  const commit = (nextJugador: string, nextPrecio: string) => {
    if (!nextJugador.trim() || nextPrecio === "") return;
    const price = Number(nextPrecio);
    if (purchase) {
      if (nextJugador.trim() === purchase.playerName && price === purchase.price) return;
      onEdit(purchase.id, { playerName: nextJugador, price });
    } else {
      onRegister(nextJugador, team.id, price, slot.id);
    }
  };

  return (
    <div className="pick-cell">
      <PlayerInput value={jugador} onChange={(value) => { setJugador(value); commit(value, precio); }} options={options} id={`board-${team.id}-${slot.id}`} />
      <div className="price-row">
        <span>$</span>
        <input aria-label={`Precio de ${team.name}, ${slot.label}`} className="price-field" type="number" min="0" value={precio} onChange={(event) => { setPrecio(event.target.value); commit(jugador, event.target.value); }} placeholder="0" disabled={league.status !== "LIVE"} />
        {purchase && <em>{purchase.position}</em>}
      </div>
    </div>
  );
}

function DraftTable({ league, onRegister, onEdit }: { league: League; onRegister: (playerName: string, teamId: string, price: number, slotId?: string) => boolean; onEdit: (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => boolean }) {
  return (
    <div className="table-wrap board-wrap">
      <table className="draft-table">
        <thead><tr><th className="sticky-col">SLOT</th>{league.teams.map((team) => { const stats = statsFor(league, team.id); return <th key={team.id}><span>{team.name}</span><small>{money(stats.remaining)} libres</small></th>; })}</tr></thead>
        <tbody>
          {league.config.slots.map((slot) => (
            <tr key={slot.id}>
              <th className="sticky-col"><span className="slot-badge">{slot.label}</span></th>
              {league.teams.map((team) => <td key={team.id}><BoardCell league={league} team={team} slot={slot} purchase={purchaseFor(league, team.id, slot.id)} onRegister={onRegister} onEdit={onEdit} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AvailablePlayers({ drafted }: { drafted: Set<string> }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"TODOS" | Position>("TODOS");
  const rankedPlayers = PLAYERS.map((player) => ({ ...player, rank: PLAYERS.filter((item) => item.posicion === player.posicion).findIndex((item) => item.nombre === player.nombre) + 1 }));
  const results = rankedPlayers.filter((player) => !drafted.has(normalizedPlayerName(player.nombre)) && (position === "TODOS" || player.posicion === position) && player.nombre.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")));
  const visiblePositions = position === "TODOS" ? POSITIONS : [position];
  return (
    <section>
      <div className="section-heading compact-heading"><div><span className="eyebrow">Agentes libres</span><h2>Disponibles por ranking y posición</h2></div><p>{PLAYERS.length - drafted.size} jugadores disponibles</p></div>
      <div className="available-panel">
        <div className="available-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador…" aria-label="Buscar jugadores disponibles" /><select value={position} onChange={(event) => setPosition(event.target.value as "TODOS" | Position)}><option value="TODOS">Todas las posiciones</option>{POSITIONS.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className={`rank-columns ${position !== "TODOS" ? "single-position" : ""}`}>
          {visiblePositions.map((pos) => { const players = results.filter((player) => player.posicion === pos); return <div className="rank-column" key={pos}><div className="rank-column-head"><strong>{pos}</strong><span>{players.length} disponibles</span></div><div className="rank-column-list">{players.length ? players.map((player) => <div className="ranked-player" key={`${player.nombre}-${player.posicion}`}><em>#{player.rank}</em><b>{player.nombre}</b></div>) : <p>No hay jugadores disponibles.</p>}</div></div>; })}
        </div>
      </div>
    </section>
  );
}

function PurchaseHistory({ league, onEdit }: { league: League; onEdit: (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const history = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <section>
      <div className="section-heading compact-heading"><div><span className="eyebrow">Registro de la noche</span><h2>Historial de compras</h2></div><p>Puedes editar una compra sin borrar las posteriores.</p></div>
      {editingId && <EditPurchaseForm league={league} purchase={league.purchases.find((item) => item.id === editingId)!} onSave={(patch) => { if (onEdit(editingId, patch)) setEditingId(null); }} onCancel={() => setEditingId(null)} />}
      <div className="history-panel">
        {history.length ? history.map((purchase, index) => { const team = league.teams.find((item) => item.id === purchase.teamId); const slot = league.config.slots.find((item) => item.id === purchase.slotId); return (
          <div className="history-row" key={purchase.id}>
            <span className="history-number">#{history.length - index}</span>
            <div><b>{purchase.playerName}</b><small>{purchase.position} · {slot?.label}</small></div>
            <span>{team?.name}</span>
            <strong>{money(purchase.price)}</strong>
            <div className="history-row-actions"><button className="history-icon-button" title="Editar" onClick={() => setEditingId(purchase.id)} disabled={league.status !== "LIVE"}>✎</button></div>
          </div>
        ); }) : <div className="history-empty">Todavía no se han registrado compras.</div>}
      </div>
    </section>
  );
}

function EditPurchaseForm({ league, purchase, onSave, onCancel }: { league: League; purchase: Purchase; onSave: (patch: { teamId: string; playerName: string; price: number }) => void; onCancel: () => void }) {
  const [playerName, setPlayerName] = useState(purchase.playerName);
  const [teamId, setTeamId] = useState(purchase.teamId);
  const [price, setPrice] = useState(String(purchase.price));
  const drafted = draftedNames(league);
  const options = PLAYERS.filter((item) => !drafted.has(normalizedPlayerName(item.nombre)) || normalizedPlayerName(item.nombre) === normalizedPlayerName(playerName));
  return (
    <div className="edit-purchase-form">
      <div className="field-grid">
        <label className="form-field"><span>Jugador</span><PlayerInput value={playerName} onChange={setPlayerName} options={options} id={`edit-player-${purchase.id}`} /></label>
        <label className="form-field"><span>Equipo</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="form-field"><span>Precio</span><input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      </div>
      <div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave({ teamId, playerName, price: Number(price) })}>Guardar cambios</button></div>
    </div>
  );
}

function TeamControl({ league }: { league: League }) {
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Control financiero</span><h2>Poder de compra por equipo</h2></div><p>Máxima puja reserva ${league.config.minimumBid} por cada slot pendiente.</p></div>
      <div className="team-grid">
        {league.teams.map((team) => { const stats = statsFor(league, team.id); const tone = stats.maxBid > 40 ? "green" : stats.maxBid < 6 ? "red" : "blue"; return (
          <article className="team-card" key={team.id}>
            <div className="team-card-head"><h3>{team.name}</h3><span>{stats.filled}/{league.config.slots.length}</span></div>
            <div className="money-pair"><Metric label="RESTANTE" value={money(stats.remaining)} /><Metric label="MÁXIMA PUJA" value={money(stats.maxBid)} tone={tone} /></div>
            <div className="stat-line"><span>Gastado <b>{money(stats.spent)}</b></span><span>Vacíos <b>{stats.emptySlots}</b></span><span>Promedio <b>${stats.average.toFixed(1)}</b></span></div>
          </article>
        ); })}
      </div>
    </>
  );
}

function NeedsTable({ league }: { league: League }) {
  const targets = league.config.roster;
  return (
    <div>
      <div className="section-heading"><div><span className="eyebrow">Radar competitivo</span><h2>Qué le falta a cada equipo</h2></div></div>
      <div className="table-wrap">
        <table className="needs-table">
          <thead><tr><th>Equipo</th>{POSITIONS.map((position) => <th key={position}>{position}</th>)}</tr></thead>
          <tbody>
            {league.teams.map((team) => { const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<Position, number>; league.purchases.filter((purchase) => purchase.teamId === team.id).forEach((purchase) => { counts[purchase.position] += 1; }); return (
              <tr key={team.id}><th>{team.name}</th>{POSITIONS.map((position) => { const missing = Math.max(0, targets[position] - counts[position]); return <td key={position}>{missing === 0 ? <span className="complete">✓</span> : <span className="missing">{missing}</span>}</td>; })}</tr>
            ); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
