"use client";

import { useEffect, useRef, useState } from "react";
import playerCatalog from "../players.json";
import { ActivityFeed, NeedsTable, TeamControl } from "./DraftBoard";
import PlayerCombobox from "./PlayerCombobox";
import Shell from "./Shell";
import { allowedPositions, money } from "../lib/formulas";
import { makeId } from "../lib/ids";
import { applyRemoteOperation, fetchLiveState, resolveManagerToken, type RemoteOperation } from "../lib/liveState";
import type { League, Player } from "../lib/types";

const PLAYERS = playerCatalog as Player[];

type Phase = "loading" | "not-found" | "error" | "ready";

export default function CoManagerView({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [label, setLabel] = useState("");
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [writeVersion, setWriteVersion] = useState(0);
  const [toast, setToast] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const resolved = await resolveManagerToken(token);
      if (resolved.status === "not-found") { setPhase("not-found"); return; }
      if (resolved.status !== "ok") { setPhase("error"); return; }
      setLeagueId(resolved.leagueId);
      setLabel(resolved.label);
      const state = await fetchLiveState(resolved.leagueId, token);
      if (state.status === "ok") { setLeague(state.league); setWriteVersion(state.writeVersion); setPhase("ready"); }
      else if (state.status === "not-found") setPhase("not-found");
      else setPhase("error");
    })();
  }, [token]);

  useEffect(() => {
    if (phase !== "ready" || !leagueId) return;
    let cancelled = false;
    const poll = async () => {
      const state = await fetchLiveState(leagueId, token);
      if (!cancelled && state.status === "ok" && state.writeVersion !== writeVersion) { setLeague(state.league); setWriteVersion(state.writeVersion); }
      if (!cancelled) pollTimerRef.current = setTimeout(poll, document.visibilityState === "visible" ? 4000 : 20000);
    };
    pollTimerRef.current = setTimeout(poll, 4000);
    return () => { cancelled = true; if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, leagueId, writeVersion]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const runOperation = async (operation: RemoteOperation) => {
    if (!leagueId) return false;
    const result = await applyRemoteOperation(leagueId, operation, makeId("op"), writeVersion, token);
    if (result.status === "ok") { setLeague(result.league); setWriteVersion(result.writeVersion); return true; }
    if (result.status === "conflict") { setLeague(result.league); setWriteVersion(result.writeVersion); setToast("Alguien más actualizó la liga justo antes — revisa e intenta de nuevo."); return false; }
    if (result.status === "rejected") { setToast(result.error); return false; }
    setToast(result.error);
    return false;
  };

  if (phase === "loading") return <Shell><section className="page-shell"><div className="empty-state"><b>Cargando…</b></div></section></Shell>;
  if (phase === "not-found") return <Shell><section className="page-shell"><div className="empty-state"><b>Este enlace de co-manager ya no existe</b><span>Puede haber sido revocado por el administrador.</span></div></section></Shell>;
  if (phase === "error" || !league) return <Shell><section className="page-shell"><div className="empty-state"><b>No se pudo cargar</b><span>Revisa tu conexión e intenta de nuevo.</span></div></section></Shell>;

  const canAct = league.status === "LIVE";

  return (
    <Shell headerCenter={<>{league.name.toUpperCase()} <span>{league.status}</span></>} footerRight={<span>Conectado como {label}</span>}>
      <section className="page-shell">
        <div className="co-manager-banner">👤 Estás editando como co-manager <b>{label}</b> — puedes registrar compras, editar el historial, mover jugadores y deshacer. No puedes cambiar la configuración ni finalizar el draft.</div>
        <div className="page-intro"><div><span className="eyebrow">Sala de subasta · {league.config.scoring}</span><h1>Draft Board</h1></div></div>

        <CoManagerQuickPurchase league={league} onOperation={runOperation} canAct={canAct} />

        <CoManagerBoard league={league} onOperation={runOperation} canAct={canAct} />
        <ActivityFeed league={league} />
        <CoManagerHistory league={league} onOperation={runOperation} canAct={canAct} />
        <TeamControl league={league} />
        <NeedsTable league={league} />

        {toast && <div className="toast" role="status">{toast}</div>}
      </section>
    </Shell>
  );
}

function CoManagerQuickPurchase({ league, onOperation, canAct }: { league: League; onOperation: (operation: RemoteOperation) => Promise<boolean>; canAct: boolean }) {
  const [player, setPlayer] = useState("");
  const [teamId, setTeamId] = useState(league.teams[0]?.id || "");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!player || price === "") return;
    setBusy(true);
    const ok = await onOperation({ kind: "purchase", teamId, playerName: player, price: Number(price) });
    setBusy(false);
    if (ok) { setPlayer(""); setPrice(""); }
  };

  return (
    <article className="last-pick-hero">
      <div className="last-pick-label"><i /> REGISTRAR COMPRA</div>
      <div className="quick-purchase" style={{ marginTop: 18 }}>
        <label htmlFor="co-quick-player">JUGADOR<PlayerCombobox value={player} onChange={setPlayer} league={league} players={PLAYERS} id="co-quick-player" disabled={!canAct || busy} /></label>
        <label>EQUIPO<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label htmlFor="co-quick-price">PRECIO<div className="quick-price"><span>$</span><input id="co-quick-price" type="number" min={league.config.minimumBid} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></div></label>
        <button className="register-button" onClick={submit} disabled={!canAct || busy}>VENDIDO</button>
      </div>
    </article>
  );
}

function CoManagerBoard({ league, onOperation, canAct }: { league: League; onOperation: (operation: RemoteOperation) => Promise<boolean>; canAct: boolean }) {
  return (
    <div className="table-wrap board-wrap">
      <table className="draft-table">
        <thead><tr><th className="sticky-col">SLOT</th>{league.teams.map((team) => <th key={team.id}><span>{team.name}</span></th>)}</tr></thead>
        <tbody>
          {league.config.slots.map((slot) => (
            <tr key={slot.id}>
              <th className="sticky-col"><span className="slot-badge">{slot.label}</span></th>
              {league.teams.map((team) => {
                const purchase = league.purchases.find((item) => item.teamId === team.id && item.slotId === slot.id);
                const otherCompatibleEmptySlots = purchase ? league.config.slots.filter((item) => item.id !== slot.id && allowedPositions(item).includes(purchase.position) && !league.purchases.some((other) => other.teamId === team.id && other.slotId === item.id)) : [];
                return (
                  <td key={team.id}>
                    <div className="pick-cell">
                      <span className="field player-field spectator-readonly">{purchase?.playerName || "—"}</span>
                      <div className="price-row"><span>$</span><span className="price-field">{purchase ? purchase.price : "0"}</span>{purchase && <em>{purchase.position}</em>}</div>
                      {purchase && canAct && otherCompatibleEmptySlots.length > 0 && (
                        <select className="move-select" value={slot.id} onChange={(event) => { if (event.target.value !== slot.id) onOperation({ kind: "move", purchaseId: purchase.id, targetSlotId: event.target.value }); }}>
                          <option value={slot.id}>{slot.label}</option>
                          {otherCompatibleEmptySlots.map((item) => <option key={item.id} value={item.id}>→ {item.label}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoManagerHistory({ league, onOperation, canAct }: { league: League; onOperation: (operation: RemoteOperation) => Promise<boolean>; canAct: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const history = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt);
  const editing = history.find((purchase) => purchase.id === editingId) || null;

  const undo = () => onOperation({ kind: "undo" });

  return (
    <section>
      <div className="section-heading compact-heading">
        <div><span className="eyebrow">Registro de la noche</span><h2>Historial de compras</h2></div>
        <button className="undo-button" disabled={!canAct || !history.length} onClick={undo}>↶ Deshacer última</button>
      </div>
      {editing && <CoManagerEditForm league={league} purchase={editing} onOperation={onOperation} onDone={() => setEditingId(null)} />}
      <div className="history-panel">
        {history.length ? history.map((purchase, index) => {
          const team = league.teams.find((item) => item.id === purchase.teamId);
          const slot = league.config.slots.find((item) => item.id === purchase.slotId);
          return (
            <div className="history-row" key={purchase.id}>
              <span className="history-number">#{history.length - index}</span>
              <div><b>{purchase.playerName}</b><small>{purchase.position} · {slot?.label}</small></div>
              <span>{team?.name}</span>
              <strong>{money(purchase.price)}</strong>
              <div className="history-row-actions"><button className="history-icon-button" title="Editar" onClick={() => setEditingId(purchase.id)} disabled={!canAct}>✎</button></div>
            </div>
          );
        }) : <div className="history-empty">Todavía no se han registrado compras.</div>}
      </div>
    </section>
  );
}

function CoManagerEditForm({ league, purchase, onOperation, onDone }: { league: League; purchase: League["purchases"][number]; onOperation: (operation: RemoteOperation) => Promise<boolean>; onDone: () => void }) {
  const [playerName, setPlayerName] = useState(purchase.playerName);
  const [teamId, setTeamId] = useState(purchase.teamId);
  const [price, setPrice] = useState(String(purchase.price));

  const save = async () => {
    const ok = await onOperation({ kind: "edit", purchaseId: purchase.id, patch: { teamId, playerName, price: Number(price) } });
    if (ok) onDone();
  };

  return (
    <div className="edit-purchase-form">
      <div className="field-grid">
        <label className="form-field" htmlFor={`co-edit-${purchase.id}`}><span>Jugador</span><PlayerCombobox value={playerName} onChange={setPlayerName} league={league} players={PLAYERS} id={`co-edit-${purchase.id}`} /></label>
        <label className="form-field"><span>Equipo</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="form-field"><span>Precio</span><input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      </div>
      <div className="settings-actions"><button className="ghost-button" onClick={onDone}>Cancelar</button><button className="save-button" onClick={save}>Guardar cambios</button></div>
    </div>
  );
}
