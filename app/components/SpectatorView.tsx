"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ActivityFeed, NeedsTable, TeamControl } from "./DraftBoard";
import Shell from "./Shell";
import { money } from "../lib/formulas";
import { fetchSpectatorSnapshot } from "../lib/spectator";
import type { League } from "../lib/types";

type Phase = "loading" | "needs-pin" | "invalid-pin" | "not-found" | "ready" | "error";
type ConnectionState = "live" | "reconnecting" | "offline";

const CONNECTION_LABEL: Record<ConnectionState, string> = { live: "🟢 LIVE", reconnecting: "🟡 RECONNECTING", offline: "🔴 OFFLINE" };
// Polling stand-in for real push (Fase 5 kept this on the free tier — see chat notes on Durable Objects).
// Fast while the tab is actually being watched, slow while backgrounded, backing off further on failures.
const POLL_VISIBLE_MS = 2500;
const POLL_HIDDEN_MS = 20_000;
const MAX_POLL_BACKOFF_MS = 15_000;

export default function SpectatorView({ spectatorId }: { spectatorId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [league, setLeague] = useState<League | null>(null);
  const [pin, setPin] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("live");
  const [errorMessage, setErrorMessage] = useState("");
  const failureCountRef = useRef(0);
  const activePinRef = useRef<string | undefined>(undefined);

  const load = async (currentPin?: string) => {
    const result = await fetchSpectatorSnapshot(spectatorId, currentPin);
    if (result.status === "ok") { setLeague(result.league); setPhase("ready"); setConnection("live"); failureCountRef.current = 0; return true; }
    if (result.status === "needs-pin") { setPhase("needs-pin"); return false; }
    if (result.status === "invalid-pin") { setPhase("invalid-pin"); return false; }
    if (result.status === "not-found") { setPhase("not-found"); return false; }
    setErrorMessage(result.status === "error" ? result.error : "Error inesperado.");
    setPhase("error");
    return false;
  };

  useEffect(() => { load(); }, [spectatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const result = await fetchSpectatorSnapshot(spectatorId, activePinRef.current);
      if (cancelled) return;
      let delay = document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
      if (result.status === "ok") {
        setLeague(result.league);
        setConnection("live");
        failureCountRef.current = 0;
      } else if (result.status === "not-found") {
        setPhase("not-found");
        return;
      } else {
        failureCountRef.current += 1;
        setConnection(failureCountRef.current >= 2 ? "offline" : "reconnecting");
        delay = Math.min(MAX_POLL_BACKOFF_MS, delay * 2 ** (failureCountRef.current - 1));
      }
      timer = setTimeout(tick, delay);
    };

    // Catch up immediately the moment the spectator comes back to the tab, instead of waiting for the
    // in-flight background-interval timer to elapse.
    const onVisibilityChange = () => { if (document.visibilityState === "visible") { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisibilityChange);

    timer = setTimeout(tick, POLL_VISIBLE_MS);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [phase, spectatorId]);

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    activePinRef.current = pin;
    await load(pin);
  };

  if (phase === "loading") return <Shell><section className="page-shell"><div className="empty-state"><b>Cargando…</b></div></section></Shell>;

  if (phase === "not-found") return <Shell><section className="page-shell"><div className="empty-state"><b>Este enlace de espectador ya no existe</b><span>Puede haber sido desactivado o regenerado por el administrador de la liga.</span></div></section></Shell>;

  if (phase === "error") return <Shell><section className="page-shell"><div className="empty-state"><b>No se pudo cargar</b><span>{errorMessage}</span></div></section></Shell>;

  if (phase === "needs-pin" || phase === "invalid-pin") {
    return (
      <Shell>
        <section className="page-shell">
          <form className="league-settings spectator-pin-gate" onSubmit={submitPin}>
            <div className="settings-head"><div><span className="eyebrow">Acceso protegido</span><h2>Esta liga pide un PIN para ver el draft</h2></div></div>
            <label className="form-field"><span>PIN</span><input autoFocus type="text" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} /></label>
            {phase === "invalid-pin" && <p className="spectator-error">PIN incorrecto.</p>}
            <div className="settings-actions"><button className="save-button" type="submit">Entrar</button></div>
          </form>
        </section>
      </Shell>
    );
  }

  if (!league) return null;

  const lastPurchase = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

  return (
    <Shell headerCenter={<>{league.name.toUpperCase()} <span>{league.status}</span></>} footerRight={<span>{CONNECTION_LABEL[connection]}</span>}>
      <section className="page-shell">
        <div className="page-intro">
          <div><span className="eyebrow">Modo espectador · solo lectura · {league.config.scoring}</span><h1>{league.name}</h1><p>Temporada {league.season} · actualiza automáticamente cada pocos segundos.</p></div>
        </div>

        <article className={`last-pick-hero ${lastPurchase ? "has-pick" : ""}`}>
          <div className="last-pick-label"><i /> ÚLTIMA COMPRA</div>
          <div className="last-pick-main">
            <div><span>{lastPurchase?.position || "EN ESPERA"}</span><h2>{lastPurchase?.playerName || "Esperando la primera compra"}</h2><p>{lastPurchase ? `${league.teams.find((team) => team.id === lastPurchase.teamId)?.name || ""} · ${league.config.slots.find((slot) => slot.id === lastPurchase.slotId)?.label || ""}` : "Este draft aún no ha comenzado."}</p></div>
            <strong>{lastPurchase ? money(lastPurchase.price) : "$—"}</strong>
          </div>
        </article>

        <SpectatorBoard league={league} />
        <ActivityFeed league={league} />
        <SpectatorHistory league={league} />
        <TeamControl league={league} />
        <NeedsTable league={league} />
      </section>
    </Shell>
  );
}

function SpectatorBoard({ league }: { league: League }) {
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
                return (
                  <td key={team.id}>
                    <div className="pick-cell">
                      <span className="field player-field spectator-readonly">{purchase?.playerName || "—"}</span>
                      <div className="price-row"><span>$</span><span className="price-field">{purchase ? purchase.price : "0"}</span>{purchase && <em>{purchase.position}</em>}</div>
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

function SpectatorHistory({ league }: { league: League }) {
  const history = [...league.purchases].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <section>
      <div className="section-heading compact-heading"><div><span className="eyebrow">Registro de la noche</span><h2>Historial de compras</h2></div></div>
      <div className="history-panel">
        {history.length ? history.map((purchase, index) => {
          const team = league.teams.find((item) => item.id === purchase.teamId);
          const slot = league.config.slots.find((item) => item.id === purchase.slotId);
          return (
            <div className="history-row spectator-history-row" key={purchase.id}>
              <span className="history-number">#{history.length - index}</span>
              <div><b>{purchase.playerName}</b><small>{purchase.position} · {slot?.label}</small></div>
              <span>{team?.name}</span>
              <strong>{money(purchase.price)}</strong>
            </div>
          );
        }) : <div className="history-empty">Todavía no se han registrado compras.</div>}
      </div>
    </section>
  );
}
