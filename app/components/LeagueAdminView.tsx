"use client";

import { useEffect, useState } from "react";
import { downloadJSON } from "../lib/download";
import { exportLeaguePayload } from "../lib/leagues";
import { loadLeague, saveLeague } from "../lib/storage";
import type { League } from "../lib/types";
import DraftBoard from "./DraftBoard";
import Shell from "./Shell";

export default function LeagueAdminView({ leagueId }: { leagueId: string }) {
  const [league, setLeague] = useState<League | null | undefined>(undefined);
  const [toast, setToast] = useState("");

  useEffect(() => { queueMicrotask(() => setLeague(loadLeague(leagueId))); }, [leagueId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleChange = (updated: League) => setLeague(saveLeague(updated));

  const exportExcel = async () => {
    if (!league) return;
    const { downloadLeagueExcel } = await import("../lib/exportExcel");
    downloadLeagueExcel(league);
    setToast("Excel exportado.");
  };

  const exportJson = () => {
    if (!league) return;
    downloadJSON(exportLeaguePayload(league), `${league.name.replace(/\s+/g, "-").toLowerCase()}.json`);
    setToast("Respaldo JSON exportado.");
  };

  if (league === undefined) return <Shell backHref="/mis-ligas" backLabel="← Mis ligas"><section className="page-shell"><div className="empty-state"><b>Cargando liga…</b></div></section></Shell>;

  if (league === null) {
    return (
      <Shell backHref="/mis-ligas" backLabel="← Mis ligas">
        <section className="page-shell">
          <div className="empty-state">
            <b>No se encontró esta liga en este dispositivo</b>
            <span>El enlace puede pertenecer a otro navegador o la liga fue eliminada.</span>
            <p><a className="save-button" href="/mis-ligas">Ir a Mis ligas</a></p>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell
      headerCenter={<>{league.name.toUpperCase()} <span>{league.status}</span></>}
      backHref="/mis-ligas"
      backLabel="← Mis ligas"
      headerRight={<>
        <button className="save-button" onClick={exportExcel}>📊 Exportar Excel</button>
        <button className="ghost-button" onClick={exportJson}>Respaldo JSON</button>
      </>}
      footerRight={<span>{league.teams.length} equipos · ${league.config.budget} · {league.config.slots.length} slots</span>}
    >
      <DraftBoard league={league} onChange={handleChange} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </Shell>
  );
}
