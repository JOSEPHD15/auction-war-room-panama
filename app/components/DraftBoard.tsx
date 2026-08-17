"use client";

import { useEffect, useState } from "react";
import playerCatalog from "../players.json";
import { buildActivityFeed } from "../lib/activityFeed";
import { finalizeDraft, renameTeams, reopenDraft, resetPurchases, startDraft, updateLeagueConfig } from "../lib/draftStatus";
import { allowedPositions, money, POSITIONS, statsFor } from "../lib/formulas";
import { makeId } from "../lib/ids";
import { applyPurchase, editPurchase, movePurchase, undoLastPurchase } from "../lib/purchaseEngine";
import { playSaleSound } from "../lib/sound";
import { getOrInitAppData, saveAppData } from "../lib/storage";
import { normalizedPlayerName, searchKey } from "../lib/text";
import { shareOrDownloadTeamCard } from "../lib/teamCardPng";
import type { League, Player, Position, Purchase, RosterCounts, Slot, Team } from "../lib/types";
import ManagerSyncBridge from "./ManagerSyncBridge";
import ManagersPanel from "./ManagersPanel";
import PlayerCombobox from "./PlayerCombobox";
import SpectatorPanel from "./SpectatorPanel";

const PLAYERS = playerCatalog as Player[];

function draftedNames(league: League): Set<string> {
  return new Set(league.purchases.map((purchase) => normalizedPlayerName(purchase.playerName)));
}

function purchaseFor(league: League, teamId: string, slotId: string): Purchase | null {
  return league.purchases.find((purchase) => purchase.teamId === teamId && purchase.slotId === slotId) || null;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`metric metric-strong ${tone ? `metric-${tone}` : ""}`}><span>{label}</span><b>{value}</b></div>;
}

export default function DraftBoard({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => typeof window === "undefined" ? true : getOrInitAppData().sound);

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

  const registerPurchase = (playerName: string, teamId: string, price: number, slotId?: string) => {
    const ok = apply(applyPurchase(league, { teamId, playerName, price, slotId }, makeId("op")), `${playerName} registrado.`);
    if (ok && soundEnabled) playSaleSound();
    return ok;
  };
  const applyEdit = (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => apply(editPurchase(league, purchaseId, patch, makeId("op")), "Compra actualizada.");
  const movePlayer = (purchaseId: string, targetSlotId: string) => apply(movePurchase(league, purchaseId, targetSlotId, makeId("op")), "Jugador movido de slot.");
  const undo = () => apply(undoLastPurchase(league, makeId("op")));

  const resetBoard = () => { if (confirm("¿Vaciar todas las compras de esta liga? El historial de auditoría se conserva.")) apply({ ok: true, league: resetPurchases(league) }, "Compras reiniciadas."); };
  const startNow = () => apply(startDraft(league), "Draft iniciado.");
  const finalizeNow = () => { if (confirm("¿Finalizar el draft? Se bloquearán nuevas compras.")) apply(finalizeDraft(league), "Draft finalizado."); };
  const reopenNow = () => { if (confirm("¿Reabrir el draft? Podrás volver a registrar y editar compras.")) apply(reopenDraft(league), "Draft reabierto."); };
  const toggleSound = () => setSoundEnabled((current) => { const next = !current; saveAppData({ ...getOrInitAppData(), sound: next }); return next; });

  const drafted = draftedNames(league);
  const lastPurchase = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

  return (
    <section className="page-shell">
      <div className="page-intro">
        <div><span className="eyebrow">Sala de subasta · {league.config.scoring} · Temporada {league.season}</span><h1>Draft Board</h1><p>Compras, presupuestos y poder de puja de toda la liga en tiempo real.</p></div>
        <div className="intro-actions">
          <button className="icon-button" onClick={toggleSound} aria-label="Sonido" title={soundEnabled ? "Sonido activado" : "Sonido desactivado"}>{soundEnabled ? "🔔" : "🔕"}</button>
          <button className="ghost-button" onClick={() => setConfigOpen((value) => !value)}>⚙ Editar liga</button>
          {league.status !== "FINALIZADO" && <button className="danger-button" onClick={resetBoard}>Vaciar compras</button>}
        </div>
      </div>

      <DraftStatusBar league={league} onStart={startNow} onFinalize={finalizeNow} onReopen={reopenNow} />

      <ManagerSyncBridge league={league} onChange={onChange} onConflict={setToast} />
      <SpectatorPanel league={league} onChange={onChange} />
      <ManagersPanel league={league} onChange={onChange} />

      {configOpen && (
        league.status === "PRE-DRAFT"
          ? <LeagueConfigForm league={league} onSave={(patch) => { if (apply(updateLeagueConfig(league, patch), "Liga actualizada.")) setConfigOpen(false); }} onCancel={() => setConfigOpen(false)} />
          : <TeamRenameForm league={league} onSave={(names) => { onChange(renameTeams(league, names)); setToast("Equipos renombrados."); setConfigOpen(false); }} onCancel={() => setConfigOpen(false)} />
      )}

      {league.status === "FINALIZADO" && <PostDraftReport league={league} />}

      <LastPurchase league={league} lastPurchase={lastPurchase} onRegister={registerPurchase} onUndo={undo} canUndo={league.purchases.length > 0 && league.status === "LIVE"} />

      <div className="legend"><span><i className="dot dot-green" /> Poder de compra &gt; $40</span><span><i className="dot dot-red" /> Topado &lt; $6</span><span><i className="dot dot-gold" /> {PLAYERS.length} jugadores · duplicados bloqueados</span></div>

      <DraftTable league={league} onRegister={registerPurchase} onEdit={applyEdit} onMove={movePlayer} />
      <AvailablePlayers league={league} drafted={drafted} />
      <ActivityFeed league={league} />
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

function LeagueConfigForm({ league, onSave, onCancel }: { league: League; onSave: (patch: { name: string; season: string; teamNames: string[]; budget: number; minimumBid: number; scoring: string; roster: RosterCounts }) => void; onCancel: () => void }) {
  const [name, setName] = useState(league.name);
  const [season, setSeason] = useState(league.season);
  const [teamNames, setTeamNames] = useState(league.teams.map((team) => team.name));
  const [budget, setBudget] = useState(league.config.budget);
  const [minimumBid, setMinimumBid] = useState(league.config.minimumBid);
  const [scoring, setScoring] = useState(league.config.scoring);
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
        <label className="form-field"><span>Puntuación</span><input value={scoring} onChange={(event) => setScoring(event.target.value)} list="scoring-presets-config" /><datalist id="scoring-presets-config"><option value="Standard" /><option value="0.5 PPR" /><option value="PPR" /></datalist></label>
      </div>
      <div className="team-name-grid">{teamNames.map((teamName, index) => <label key={index}><span>{index + 1}</span><input value={teamName} onChange={(event) => setTeamNames((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /></label>)}</div>
      <div className="field-grid">
        {(["QB", "RB", "WR", "TE", "K", "DEF"] as const).map((position) => <label className="form-field" key={position}><span>{position}</span><input type="number" min="0" value={roster[position]} onChange={(event) => setRosterField(position, Number(event.target.value) || 0)} /></label>)}
        <label className="form-field"><span>FLEX</span><input type="number" min="0" value={roster.FLEX} onChange={(event) => setRosterField("FLEX", Number(event.target.value) || 0)} /></label>
        <label className="form-field"><span>BANCA</span><input type="number" min="0" value={roster.BENCH} onChange={(event) => setRosterField("BENCH", Number(event.target.value) || 0)} /></label>
      </div>
      <div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave({ name, season, teamNames, budget, minimumBid, scoring, roster })}>Guardar</button></div>
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

function LastPurchase({ league, lastPurchase, onRegister, onUndo, canUndo }: { league: League; lastPurchase: Purchase | null; onRegister: (playerName: string, teamId: string, price: number) => boolean; onUndo: () => void; canUndo: boolean }) {
  const [player, setPlayer] = useState("");
  const [teamId, setTeamId] = useState(league.teams[0]?.id || "");
  const [price, setPrice] = useState("");
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
        <label htmlFor="quick-player-list">JUGADOR<PlayerCombobox value={player} onChange={setPlayer} league={league} players={PLAYERS} id="quick-player-list" disabled={league.status !== "LIVE"} /></label>
        <label>EQUIPO<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label htmlFor="quick-price">PRECIO<div className="quick-price"><span>$</span><input id="quick-price" type="number" min={league.config.minimumBid} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" onKeyDown={(event) => { if (event.key === "Enter" && player && team && price !== "") submit(); }} /></div></label>
        <button className="register-button" onClick={submit} disabled={league.status !== "LIVE"}>VENDIDO</button>
        <button className="undo-button" disabled={!canUndo} onClick={onUndo}>↶ Deshacer</button>
      </div>
    </article>
  );
}

function BoardCell({ league, team, slot, purchase, onRegister, onEdit, onMove }: { league: League; team: Team; slot: Slot; purchase: Purchase | null; onRegister: (playerName: string, teamId: string, price: number, slotId?: string) => boolean; onEdit: (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => boolean; onMove: (purchaseId: string, targetSlotId: string) => boolean }) {
  const [jugador, setJugador] = useState(purchase?.playerName || "");
  const [precio, setPrecio] = useState(purchase ? String(purchase.price) : "");

  useEffect(() => {
    queueMicrotask(() => {
      setJugador(purchase?.playerName || "");
      setPrecio(purchase ? String(purchase.price) : "");
    });
  }, [purchase]);

  const positionPlayers = PLAYERS.filter((item) => allowedPositions(slot).includes(item.posicion));

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

  const otherCompatibleEmptySlots = purchase ? league.config.slots.filter((item) => item.id !== slot.id && allowedPositions(item).includes(purchase.position) && !league.purchases.some((other) => other.teamId === team.id && other.slotId === item.id)) : [];

  return (
    <div className="pick-cell">
      <PlayerCombobox value={jugador} onChange={(value) => { setJugador(value); commit(value, precio); }} league={league} players={positionPlayers} id={`board-${team.id}-${slot.id}`} disabled={league.status !== "LIVE"} />
      <div className="price-row">
        <span>$</span>
        <input aria-label={`Precio de ${team.name}, ${slot.label}`} className="price-field" type="number" min="0" value={precio} onChange={(event) => { setPrecio(event.target.value); commit(jugador, event.target.value); }} placeholder="0" disabled={league.status !== "LIVE"} />
        {purchase && <em>{purchase.position}</em>}
      </div>
      {purchase && otherCompatibleEmptySlots.length > 0 && (
        <select className="move-select" aria-label={`Mover a ${purchase.playerName} a otro slot`} value={slot.id} disabled={league.status !== "LIVE"} onChange={(event) => { if (event.target.value !== slot.id) onMove(purchase.id, event.target.value); }}>
          <option value={slot.id}>{slot.label}</option>
          {otherCompatibleEmptySlots.map((item) => <option key={item.id} value={item.id}>→ {item.label}</option>)}
        </select>
      )}
    </div>
  );
}

function DraftTable({ league, onRegister, onEdit, onMove }: { league: League; onRegister: (playerName: string, teamId: string, price: number, slotId?: string) => boolean; onEdit: (purchaseId: string, patch: { teamId?: string; playerName?: string; price?: number }) => boolean; onMove: (purchaseId: string, targetSlotId: string) => boolean }) {
  return (
    <div className="table-wrap board-wrap">
      <table className="draft-table">
        <thead><tr><th className="sticky-col">SLOT</th>{league.teams.map((team) => { const stats = statsFor(league, team.id); return <th key={team.id}><span>{team.name}</span><small>{money(stats.remaining)} libres</small></th>; })}</tr></thead>
        <tbody>
          {league.config.slots.map((slot) => (
            <tr key={slot.id}>
              <th className="sticky-col"><span className="slot-badge">{slot.label}</span></th>
              {league.teams.map((team) => <td key={team.id}><BoardCell league={league} team={team} slot={slot} purchase={purchaseFor(league, team.id, slot.id)} onRegister={onRegister} onEdit={onEdit} onMove={onMove} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AvailablePlayers({ league, drafted }: { league: League; drafted: Set<string> }) {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<"TODOS" | Position>("TODOS");
  const [selected, setSelected] = useState<Player | null>(null);
  const rankedPlayers = PLAYERS.map((player) => ({ ...player, rank: PLAYERS.filter((item) => item.posicion === player.posicion).findIndex((item) => item.nombre === player.nombre) + 1 }));
  const query = searchKey(search);
  const results = rankedPlayers.filter((player) => !drafted.has(normalizedPlayerName(player.nombre)) && (position === "TODOS" || player.posicion === position) && (!query || searchKey(player.nombre).includes(query)));
  const visiblePositions = position === "TODOS" ? POSITIONS : [position];
  return (
    <section>
      <div className="section-heading compact-heading"><div><span className="eyebrow">Agentes libres</span><h2>Disponibles por ranking y posición</h2></div><p>{PLAYERS.length - drafted.size} jugadores disponibles</p></div>
      <div className="available-panel">
        <div className="available-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar jugador (ignora acentos)…" aria-label="Buscar jugadores disponibles" /><select value={position} onChange={(event) => setPosition(event.target.value as "TODOS" | Position)}><option value="TODOS">Todas las posiciones</option>{POSITIONS.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className={`rank-columns ${position !== "TODOS" ? "single-position" : ""}`}>
          {visiblePositions.map((pos) => { const players = results.filter((player) => player.posicion === pos); return <div className="rank-column" key={pos}><div className="rank-column-head"><strong>{pos}</strong><span>{players.length} disponibles</span></div><div className="rank-column-list">{players.length ? players.map((player) => <button type="button" className={`ranked-player ${selected?.nombre === player.nombre ? "active" : ""}`} key={`${player.nombre}-${player.posicion}`} onClick={() => setSelected(player)}><em>#{player.rank}</em><b>{player.nombre}</b></button>) : <p>No hay jugadores disponibles.</p>}</div></div>; })}
        </div>
        {selected && <CompetitiveIntel league={league} player={selected} onClose={() => setSelected(null)} />}
      </div>
    </section>
  );
}

function CompetitiveIntel({ league, player, onClose }: { league: League; player: Player; onClose: () => void }) {
  const interested = league.teams
    .map((team) => ({ team, stats: statsFor(league, team.id), hasSlot: league.config.slots.some((slot) => allowedPositions(slot).includes(player.posicion) && !league.purchases.some((purchase) => purchase.teamId === team.id && purchase.slotId === slot.id)) }))
    .filter((item) => item.hasSlot)
    .sort((a, b) => b.stats.maxBid - a.stats.maxBid);
  const overThreshold = interested.filter((item) => item.stats.maxBid > 40).length;
  return (
    <div className="intel-panel">
      <div className="intel-head">
        <div><b>{player.nombre}</b><span> · {player.posicion}</span></div>
        <button className="history-icon-button" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>
      <p className="intel-summary">{interested.length} equipos necesitan {player.posicion} · {overThreshold} pueden superar $40</p>
      <div className="intel-list">
        {interested.map(({ team, stats }) => <div className="intel-row" key={team.id}><span>{team.name}</span><strong>MAX {money(stats.maxBid)}</strong></div>)}
        {!interested.length && <p className="intel-empty">Ningún equipo tiene un slot compatible disponible.</p>}
      </div>
    </div>
  );
}

export function ActivityFeed({ league }: { league: League }) {
  const entries = buildActivityFeed(league, 40);
  return (
    <section>
      <div className="section-heading compact-heading"><div><span className="eyebrow">En vivo</span><h2>Activity Feed</h2></div><p>Compras, ediciones, undo, movimientos e inicio/fin del draft — derivado del Event Log.</p></div>
      <div className="history-panel activity-feed">
        {entries.length ? entries.map((entry) => (
          <div className="activity-row" key={entry.id}>
            <span>{entry.label}</span>
            <span className="activity-time">{new Intl.DateTimeFormat("es-PA", { timeStyle: "short" }).format(new Date(entry.timestamp))}</span>
          </div>
        )) : <div className="history-empty">Todavía no hay actividad.</div>}
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
  return (
    <div className="edit-purchase-form">
      <div className="field-grid">
        <label className="form-field" htmlFor={`edit-player-${purchase.id}`}><span>Jugador</span><PlayerCombobox value={playerName} onChange={setPlayerName} league={league} players={PLAYERS} id={`edit-player-${purchase.id}`} /></label>
        <label className="form-field"><span>Equipo</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="form-field"><span>Precio</span><input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      </div>
      <div className="settings-actions"><button className="ghost-button" onClick={onCancel}>Cancelar</button><button className="save-button" onClick={() => onSave({ teamId, playerName, price: Number(price) })}>Guardar cambios</button></div>
    </div>
  );
}

export function TeamControl({ league }: { league: League }) {
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Control financiero</span><h2>Poder de compra por equipo</h2></div><p>Máxima puja reserva ${league.config.minimumBid} por cada slot pendiente.</p></div>
      <div className="team-grid">
        {league.teams.map((team) => { const stats = statsFor(league, team.id); const tone = stats.maxBid > 40 ? "green" : stats.maxBid < 6 ? "red" : "blue"; return (
          <article className="team-card" key={team.id}>
            <div className="team-card-head"><h3>{team.name}</h3><span>{stats.filled}/{league.config.slots.length}</span></div>
            <div className="money-pair"><Metric label="RESTANTE" value={money(stats.remaining)} /><Metric label="MÁXIMA PUJA" value={money(stats.maxBid)} tone={tone} /></div>
            <div className="stat-line"><span>Gastado <b>{money(stats.spent)}</b></span><span>Vacíos <b>{stats.emptySlots}</b></span><span>Promedio <b>${stats.average.toFixed(1)}</b></span></div>
            <button className="ghost-button team-card-share" onClick={() => shareOrDownloadTeamCard(league, team)}>📤 Compartir / Descargar resumen</button>
          </article>
        ); })}
      </div>
    </>
  );
}

function PostDraftReport({ league }: { league: League }) {
  const rows = league.teams.map((team) => {
    const stats = statsFor(league, team.id);
    const teamPurchases = league.purchases.filter((purchase) => purchase.teamId === team.id);
    const priciest = [...teamPurchases].sort((a, b) => b.price - a.price)[0];
    const byPosition = Object.fromEntries(POSITIONS.map((position) => [position, teamPurchases.filter((purchase) => purchase.position === position).reduce((sum, purchase) => sum + purchase.price, 0)])) as Record<Position, number>;
    return { team, stats, priciest, byPosition, avgPerPlayer: teamPurchases.length ? stats.spent / teamPurchases.length : 0 };
  });
  const leagueAvg = league.purchases.length ? league.purchases.reduce((sum, purchase) => sum + purchase.price, 0) / league.purchases.length : 0;
  const priciestOverall = [...league.purchases].sort((a, b) => b.price - a.price)[0];
  return (
    <section>
      <div className="section-heading"><div><span className="eyebrow">Resultados finales</span><h2>Reporte post-draft</h2></div><p>Promedio de la liga: {money(leagueAvg)}/jugador · Compra más cara del draft: {priciestOverall ? `${priciestOverall.playerName} (${money(priciestOverall.price)})` : "—"}</p></div>
      <div className="table-wrap">
        <table className="needs-table report-table">
          <thead><tr><th>Equipo</th><th>Gastado</th><th>Restante</th><th>Prom./jugador</th><th>Más caro</th>{POSITIONS.map((position) => <th key={position}>{position}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ team, stats, priciest, byPosition, avgPerPlayer }) => (
              <tr key={team.id}>
                <th>{team.name}</th>
                <td>{money(stats.spent)}</td>
                <td>{money(stats.remaining)}</td>
                <td>${avgPerPlayer.toFixed(1)}</td>
                <td>{priciest ? `${priciest.playerName} (${money(priciest.price)})` : "—"}</td>
                {POSITIONS.map((position) => <td key={position}>{money(byPosition[position])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function NeedsTable({ league }: { league: League }) {
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
