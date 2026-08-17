"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { makeSpectatorId } from "../lib/ids";
import { disableSpectatorSnapshot, publishSpectatorSnapshot } from "../lib/spectator";
import { backoffDelayMs, clearQueueEntry, markFailed, markSynced, markSyncing, needsSync, type SyncStatus } from "../lib/syncQueue";
import type { League } from "../lib/types";

const STATUS_LABEL: Record<SyncStatus, string> = { pending: "Pendiente de sincronizar", syncing: "Sincronizando…", synced: "Sincronizado", failed: "Sin conexión — reintentando" };
const STATUS_DOT: Record<SyncStatus, string> = { pending: "🟡", syncing: "🟡", synced: "🟢", failed: "🔴" };

export default function SpectatorPanel({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [syncError, setSyncError] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const link = league.spectatorId && typeof window !== "undefined" ? `${window.location.origin}/draft/${league.spectatorId}` : "";

  // Offline-first sync queue: the local save already happened before this component even re-renders (that's
  // how `league` got here) — this only mirrors the current state to D1 for spectators, best-effort, with
  // retry/backoff. It survives a page refresh because `needsSync` compares against a queue entry persisted
  // in localStorage, not React state, so a reload picks up right where it left off instead of losing the sync.
  useEffect(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (!league.spectatorId) return;
    if (!needsSync(league.id, league.updatedAt)) { queueMicrotask(() => setSyncStatus("synced")); return; }

    let cancelled = false;
    const attempt = async (attemptNumber: number) => {
      markSyncing(league.id);
      setSyncStatus("syncing");
      const result = await publishSpectatorSnapshot(league);
      if (cancelled) return;
      if (result.ok) {
        markSynced(league.id, league.updatedAt);
        setSyncStatus("synced");
        setSyncError("");
      } else {
        markFailed(league.id, result.error || "Error");
        setSyncStatus("failed");
        setSyncError(result.error || "Error");
        retryTimerRef.current = setTimeout(() => attempt(attemptNumber + 1), backoffDelayMs(attemptNumber));
      }
    };
    attempt(0);

    return () => { cancelled = true; if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id, league.updatedAt, league.spectatorId]);

  const activate = async () => {
    const spectatorId = makeSpectatorId();
    onChange({ ...league, spectatorId, spectatorPinEnabled: false });
  };

  const deactivate = async () => {
    if (!confirm("¿Desactivar el modo espectador? El enlace actual dejará de funcionar.")) return;
    if (league.spectatorId) { await disableSpectatorSnapshot(league.spectatorId, league.adminToken); clearQueueEntry(league.id); }
    onChange({ ...league, spectatorId: null, spectatorPinEnabled: false });
  };

  const regenerate = async () => {
    if (!league.spectatorId) return;
    const warning = league.spectatorPinEnabled ? " y tendrás que volver a configurar el PIN." : ".";
    if (!confirm(`¿Regenerar el enlace? El enlace anterior dejará de funcionar de inmediato${warning}`)) return;
    const previousSpectatorId = league.spectatorId;
    clearQueueEntry(league.id);
    onChange({ ...league, spectatorId: makeSpectatorId(), spectatorPinEnabled: false });
    // The next render's effect publishes the new snapshot; we just need to drop the old row.
    setTimeout(() => disableSpectatorSnapshot(previousSpectatorId, league.adminToken), 1500);
  };

  const savePin = async () => {
    if (!league.spectatorId) return;
    const trimmed = pinInput.trim();
    const result = await publishSpectatorSnapshot(league, { pin: trimmed || null });
    if (result.ok) { onChange({ ...league, spectatorPinEnabled: !!trimmed }); setPinInput(""); } else { setSyncStatus("failed"); setSyncError(result.error || ""); }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access may be unavailable (permissions, insecure context) — the link is still visible to select/copy manually
    }
  };

  const toggleQr = async () => {
    if (!showQr && link && !qrDataUrl) setQrDataUrl(await QRCode.toDataURL(link, { margin: 1, width: 240 }));
    setShowQr((value) => !value);
  };

  return (
    <div className="spectator-panel">
      <div className="spectator-head">
        <div><span className="eyebrow">Modo espectador</span><h2>{league.spectatorId ? `${STATUS_DOT[syncStatus]} ${STATUS_LABEL[syncStatus]}` : "⚪ Desactivado"}</h2></div>
        {league.spectatorId ? <button className="danger-button" onClick={deactivate}>Desactivar</button> : <button className="save-button" onClick={activate}>Activar enlace de espectador</button>}
      </div>
      {league.spectatorId && (
        <>
          <p className="spectator-note">Cualquiera con este enlace puede ver el Draft Board en modo solo lectura. No aparece en ningún directorio público ni permite editar, importar o finalizar el draft.</p>
          <div className="spectator-link-row">
            <input readOnly value={link} onFocus={(event) => event.target.select()} />
            <button className="ghost-button" onClick={copyLink}>{copied ? "Copiado ✓" : "Copiar link"}</button>
            <button className="ghost-button" onClick={toggleQr}>{showQr ? "Ocultar QR" : "Mostrar QR"}</button>
            <button className="ghost-button" onClick={regenerate}>Regenerar link</button>
          </div>
          {/* Generated data URL: next/image cannot optimize this transient client-side asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {showQr && qrDataUrl && <img className="spectator-qr" src={qrDataUrl} alt="Código QR del enlace de espectador" />}
          <div className="spectator-pin-row">
            <input type="text" inputMode="numeric" maxLength={8} placeholder={league.spectatorPinEnabled ? "PIN activo · escribe uno nuevo o deja vacío para quitarlo" : "PIN opcional (vacío = sin PIN)"} value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
            <button className="ghost-button" onClick={savePin}>Guardar PIN</button>
          </div>
          {syncStatus === "failed" && <p className="spectator-error">Sin conexión con el servidor — tus compras siguen guardadas localmente y se reintentará automáticamente: {syncError}</p>}
        </>
      )}
    </div>
  );
}
