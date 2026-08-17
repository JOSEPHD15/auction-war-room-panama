"use client";

import { useEffect, useRef } from "react";
import { fetchLiveState, publishLiveState } from "../lib/liveState";
import type { League } from "../lib/types";

/**
 * Invisible component that keeps the admin's local league reconciled with D1's `league_live_state`
 * whenever co-managers exist. The admin's own writes always apply locally first (never blocked by the
 * network, same as always) — this only pushes the result in the background with an optimistic-concurrency
 * check, and pulls whatever a co-manager just did. A conflict means someone else's write already landed
 * in D1; we accept that as the source of truth rather than silently overwriting it (no blind
 * Last-Write-Wins), and the admin sees a toast so it's never a silent correction.
 */
export default function ManagerSyncBridge({ league, onChange, onConflict }: { league: League; onChange: (league: League) => void; onConflict: (message: string) => void }) {
  const lastKnownRemoteVersionRef = useRef<number>(-1);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!league.managers.length) return;
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    if (lastKnownRemoteVersionRef.current === league.writeVersion) return;

    publishTimerRef.current = setTimeout(async () => {
      const result = await publishLiveState(league, league.writeVersion);
      if (result.status === "ok") {
        lastKnownRemoteVersionRef.current = league.writeVersion;
      } else if (result.status === "conflict") {
        lastKnownRemoteVersionRef.current = result.writeVersion;
        onChange(result.league);
        onConflict("Un co-manager registró un cambio mientras editabas — se actualizó el tablero con lo más reciente.");
      }
      // network errors: just retry on the next local change or the next poll tick below
    }, 600);

    return () => { if (publishTimerRef.current) clearTimeout(publishTimerRef.current); };
  }, [league, onChange, onConflict]);

  useEffect(() => {
    if (!league.managers.length) return;
    let cancelled = false;

    const poll = async () => {
      const result = await fetchLiveState(league.id);
      if (!cancelled && result.status === "ok" && result.writeVersion > lastKnownRemoteVersionRef.current) {
        lastKnownRemoteVersionRef.current = result.writeVersion;
        onChange(result.league);
      }
      if (cancelled) return;
      const delay = document.visibilityState === "visible" ? 4000 : 20000;
      pollTimerRef.current = setTimeout(poll, delay);
    };

    poll();
    return () => { cancelled = true; if (pollTimerRef.current) clearTimeout(pollTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id, league.managers.length]);

  return null;
}
