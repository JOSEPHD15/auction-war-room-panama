"use client";

import { useState } from "react";
import { makeSpectatorId } from "../lib/ids";
import { publishSpectatorSnapshot } from "../lib/spectator";
import type { League } from "../lib/types";

export default function ShareLeagueButton({ league, onChange }: { league: League; onChange: (league: League) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const sharedLeague = league.spectatorId ? league : { ...league, spectatorId: makeSpectatorId(), spectatorPinEnabled: false };
  const link = typeof window !== "undefined" ? `${window.location.origin}/draft/${sharedLeague.spectatorId}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setOpen(true);
    }
  };

  const share = async () => {
    setBusy(true);
    setError("");
    if (!league.spectatorId) onChange(sharedLeague);
    const result = await publishSpectatorSnapshot(sharedLeague);
    if (!result.ok) {
      setError(result.error || "No se pudo crear el enlace.");
      setOpen(true);
      setBusy(false);
      return;
    }

    setOpen(true);
    const nativeShare = navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
    if (nativeShare.share) {
      try {
        await nativeShare.share({ title: league.name, text: `Sigue en vivo el draft de ${league.name}`, url: link });
      } catch {
        // If the share sheet is cancelled, the copyable link remains open.
      }
    } else {
      await copy();
    }
    setBusy(false);
  };

  return (
    <div className="share-league-wrap">
      <button className="share-league-button" onClick={share} disabled={busy}>↗ {busy ? "Preparando…" : "Compartir liga"}</button>
      {open && (
        <div className="share-league-popover" role="dialog" aria-label="Compartir liga">
          <button className="share-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
          <span className="eyebrow">Enlace público · solo lectura</span>
          <strong>Comparte el draft en vivo</strong>
          <p>Quien abra este enlace podrá ver el tablero, pero no hacer cambios.</p>
          <div><input readOnly value={link} onFocus={(event) => event.target.select()} /><button className="save-button" onClick={copy}>{copied ? "Copiado ✓" : "Copiar"}</button></div>
          {error && <small className="spectator-error">{error}</small>}
        </div>
      )}
    </div>
  );
}
