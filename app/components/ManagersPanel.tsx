"use client";

import { useState } from "react";
import { addManager, removeManager } from "../lib/draftStatus";
import { fetchLiveState, publishLiveState, registerManagerToken, revokeManagerToken } from "../lib/liveState";
import type { League } from "../lib/types";

export default function ManagersPanel({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const linkFor = (managerId: string) => (typeof window !== "undefined" ? `${window.location.origin}/liga/co/${managerId}` : "");

  const publishWithRetry = async (mutate: (base: League) => League): Promise<{ ok: boolean; league?: League }> => {
    const attempt = mutate(league);
    const result = await publishLiveState(attempt, league.writeVersion);
    if (result.status === "ok") return { ok: true, league: attempt };
    if (result.status === "error") return { ok: false };
    // Conflict: someone else's write landed first — reapply our intended change on top of the fresh state and try once more.
    const fresh = await fetchLiveState(league.id);
    if (fresh.status !== "ok") return { ok: false };
    const retryAttempt = mutate(fresh.league);
    const retryResult = await publishLiveState(retryAttempt, fresh.writeVersion);
    return retryResult.status === "ok" ? { ok: true, league: retryAttempt } : { ok: false };
  };

  const addCoManager = async () => {
    setBusy(true);
    setError("");
    const { league: withManager, manager } = addManager(league, label);
    const published = await publishWithRetry(() => withManager);
    if (!published.ok || !published.league) { setError("No se pudo activar el enlace — revisa tu conexión e intenta de nuevo."); setBusy(false); return; }
    await registerManagerToken(league.id, manager.id, manager.label);
    onChange(published.league);
    setLabel("");
    setBusy(false);
  };

  const removeCoManager = async (managerId: string) => {
    if (!confirm("¿Revocar el acceso de este co-manager? Su enlace dejará de funcionar de inmediato.")) return;
    setBusy(true);
    setError("");
    const published = await publishWithRetry((base) => removeManager(base, managerId));
    if (!published.ok || !published.league) { setError("No se pudo revocar — revisa tu conexión e intenta de nuevo."); setBusy(false); return; }
    await revokeManagerToken(league.id, managerId);
    onChange(published.league);
    setBusy(false);
  };

  const copyLink = async (managerId: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(managerId));
      setCopiedId(managerId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard may be unavailable — the link row is still visible to select manually
    }
  };

  return (
    <div className="spectator-panel">
      <div className="spectator-head">
        <div><span className="eyebrow">Co-managers</span><h2>{league.managers.length ? `${league.managers.length} activo(s)` : "Sin co-managers"}</h2></div>
      </div>
      <p className="spectator-note">Un co-manager puede registrar compras, editar el historial, mover jugadores y deshacer — no puede administrar accesos, editar la configuración ni finalizar el draft. Sus compras requieren conexión (no tienen una copia local de la liga).</p>

      {league.managers.length > 0 && (
        <div className="manager-list">
          {league.managers.map((manager) => (
            <div className="manager-row" key={manager.id}>
              <span className="manager-label">{manager.label}</span>
              <input readOnly value={linkFor(manager.id)} onFocus={(event) => event.target.select()} />
              <button className="ghost-button" onClick={() => copyLink(manager.id)}>{copiedId === manager.id ? "Copiado ✓" : "Copiar link"}</button>
              <button className="danger-button" onClick={() => removeCoManager(manager.id)} disabled={busy}>Revocar</button>
            </div>
          ))}
        </div>
      )}

      <div className="spectator-pin-row">
        <input type="text" placeholder="Nombre del co-manager (ej. Juan)" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={40} />
        <button className="save-button" onClick={addCoManager} disabled={busy || !label.trim()}>+ Agregar co-manager</button>
      </div>
      {error && <p className="spectator-error">{error}</p>}
    </div>
  );
}
