"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { makeSpectatorId } from "../lib/ids";
import { disableSpectatorSnapshot, publishSpectatorSnapshot } from "../lib/spectator";
import type { League } from "../lib/types";

type SyncStatus = "idle" | "syncing" | "synced" | "error";

export default function SpectatorPanel({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = league.spectatorId && typeof window !== "undefined" ? `${window.location.origin}/draft/${league.spectatorId}` : "";

  // Keep the D1 snapshot in sync with every league change while spectator mode is on — offline-first: the
  // local save already happened (that's how `league` got here), this is a best-effort background sync only.
  useEffect(() => {
    if (!league.spectatorId) return;
    setSyncStatus("syncing");
    const timer = setTimeout(async () => {
      const result = await publishSpectatorSnapshot(league);
      if (result.ok) { setSyncStatus("synced"); setSyncError(""); } else { setSyncStatus("error"); setSyncError(result.error || "Error"); }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  const activate = async () => {
    const spectatorId = makeSpectatorId();
    const next = { ...league, spectatorId, spectatorPinEnabled: false };
    onChange(next);
    setSyncStatus("syncing");
    const result = await publishSpectatorSnapshot(next);
    setSyncStatus(result.ok ? "synced" : "error");
    setSyncError(result.error || "");
  };

  const deactivate = async () => {
    if (!confirm("¿Desactivar el modo espectador? El enlace actual dejará de funcionar.")) return;
    if (league.spectatorId) await disableSpectatorSnapshot(league.spectatorId);
    onChange({ ...league, spectatorId: null, spectatorPinEnabled: false });
    setSyncStatus("idle");
  };

  const regenerate = async () => {
    if (!league.spectatorId) return;
    const warning = league.spectatorPinEnabled ? " y tendrás que volver a configurar el PIN." : ".";
    if (!confirm(`¿Regenerar el enlace? El enlace anterior dejará de funcionar de inmediato${warning}`)) return;
    const previousSpectatorId = league.spectatorId;
    const spectatorId = makeSpectatorId();
    const next = { ...league, spectatorId, spectatorPinEnabled: false };
    onChange(next);
    setSyncStatus("syncing");
    const result = await publishSpectatorSnapshot(next, { previousSpectatorId });
    setSyncStatus(result.ok ? "synced" : "error");
    if (!result.ok) setSyncError(result.error || "");
  };

  const savePin = async () => {
    if (!league.spectatorId) return;
    const trimmed = pinInput.trim();
    setSyncStatus("syncing");
    const result = await publishSpectatorSnapshot(league, { pin: trimmed || null });
    if (result.ok) { onChange({ ...league, spectatorPinEnabled: !!trimmed }); setPinInput(""); setSyncStatus("synced"); } else { setSyncStatus("error"); setSyncError(result.error || ""); }
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

  const statusDot = syncStatus === "error" ? "🔴" : syncStatus === "syncing" ? "🟡" : league.spectatorId ? "🟢" : "⚪";

  return (
    <div className="spectator-panel">
      <div className="spectator-head">
        <div><span className="eyebrow">Modo espectador</span><h2>{statusDot} {league.spectatorId ? "Enlace activo" : "Desactivado"}</h2></div>
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
          {showQr && qrDataUrl && <img className="spectator-qr" src={qrDataUrl} alt="Código QR del enlace de espectador" />}
          <div className="spectator-pin-row">
            <input type="text" inputMode="numeric" maxLength={8} placeholder={league.spectatorPinEnabled ? "PIN activo · escribe uno nuevo o deja vacío para quitarlo" : "PIN opcional (vacío = sin PIN)"} value={pinInput} onChange={(event) => setPinInput(event.target.value)} />
            <button className="ghost-button" onClick={savePin}>Guardar PIN</button>
          </div>
          {syncStatus === "error" && <p className="spectator-error">No se pudo sincronizar con el servidor: {syncError}</p>}
        </>
      )}
    </div>
  );
}
