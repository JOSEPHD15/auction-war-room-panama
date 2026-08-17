"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import DraftBoard from "./components/DraftBoard";
import LeagueSelector, { CreateLeagueInput } from "./components/LeagueSelector";
import { downloadJSON } from "./lib/download";
import { createLeague, duplicateLeague, exportAllLeaguesPayload, exportLeaguePayload, parseImportFile, withFreshId } from "./lib/leagues";
import { APP_VERSION, deleteLeague, ensureMigrated, getOrInitAppData, listLeagueSummaries, loadLeague, saveAppData, saveLeague, SCHEMA_VERSION } from "./lib/storage";
import type { AppData, League, LeagueSummary } from "./lib/types";

const INITIAL_APP_DATA: AppData = { schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, lastOpenedLeagueId: null, dark: true };

export default function Home() {
  const [appData, setAppData] = useState<AppData>(INITIAL_APP_DATA);
  const [league, setLeague] = useState<League | null>(null);
  const [summaries, setSummaries] = useState<LeagueSummary[]>([]);
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const refreshSummaries = () => setSummaries(listLeagueSummaries());

  useEffect(() => {
    ensureMigrated();
    const data = getOrInitAppData();
    setAppData(data);
    refreshSummaries();
    if (data.lastOpenedLeagueId) {
      const found = loadLeague(data.lastOpenedLeagueId);
      if (found) setLeague(found);
      else saveAppData({ ...data, lastOpenedLeagueId: null });
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const openLeague = (id: string) => {
    const found = loadLeague(id);
    if (!found) { setToast("No se pudo abrir la liga."); refreshSummaries(); return; }
    setLeague(found);
    const nextApp = { ...appData, lastOpenedLeagueId: id };
    saveAppData(nextApp);
    setAppData(nextApp);
  };

  const backToLeagues = () => {
    setLeague(null);
    const nextApp = { ...appData, lastOpenedLeagueId: null };
    saveAppData(nextApp);
    setAppData(nextApp);
    refreshSummaries();
  };

  const handleLeagueChange = (updated: League) => {
    const saved = saveLeague(updated);
    setLeague(saved);
    refreshSummaries();
  };

  const handleCreate = (input: CreateLeagueInput) => {
    const created = saveLeague(createLeague(input));
    const nextApp = { ...appData, lastOpenedLeagueId: created.id };
    saveAppData(nextApp);
    setAppData(nextApp);
    setLeague(created);
    refreshSummaries();
    setToast(`Liga "${created.name}" creada.`);
  };

  const handleDuplicate = (id: string) => {
    const source = loadLeague(id);
    if (!source) { setToast("No se pudo duplicar la liga."); return; }
    saveLeague(duplicateLeague(source));
    refreshSummaries();
    setToast("Liga duplicada.");
  };

  const handleDelete = (id: string) => {
    deleteLeague(id);
    if (league?.id === id) { setLeague(null); setAppData((current) => current ? { ...current, lastOpenedLeagueId: null } : current); }
    refreshSummaries();
    setToast("Liga eliminada.");
  };

  const toggleDark = () => {
    const nextApp = { ...appData, dark: !appData.dark };
    saveAppData(nextApp);
    setAppData(nextApp);
  };

  const exportCurrentLeague = () => {
    if (!league) return;
    downloadJSON(exportLeaguePayload(league), `liga-${league.name.replace(/\s+/g, "-").toLowerCase()}.json`);
    setToast("Liga exportada.");
  };

  const exportAllLeagues = () => {
    const all = summaries.map((summary) => loadLeague(summary.id)).filter((item): item is League => !!item);
    downloadJSON(exportAllLeaguesPayload(all), `auction-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setToast("Todas las ligas exportadas.");
  };

  const importLeaguesFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseImportFile(text);
    if (!parsed.ok) { setToast(`No se importó: ${parsed.error}`); return; }
    let imported = 0;
    for (let candidate of parsed.leagues) {
      const existing = loadLeague(candidate.id);
      if (existing) {
        const replace = confirm(`Ya existe una liga guardada con el mismo ID que "${candidate.name}". ¿Reemplazarla? (Cancelar para importarla como copia nueva)`);
        if (!replace) candidate = withFreshId(candidate);
      }
      saveLeague(candidate);
      imported += 1;
    }
    refreshSummaries();
    setToast(`${imported} liga(s) importada(s).`);
  };

  const importSingleLeagueFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) importLeaguesFile(file);
  };

  return (
    <main className={appData.dark ? "app theme-dark" : "app theme-light"}>
      <header className="topbar public-topbar">
        <button className="brand" aria-label="Auction War Room" onClick={league ? backToLeagues : undefined}>
          <span className="brand-mark brand-mark-image"><img src="/draftlab-logo.jpeg" alt="Draft Lab" /></span>
          <span><b>AUCTION</b><small>WAR ROOM · MULTI-LIGA</small></span>
        </button>
        <div className="public-title">{league ? <>{league.name.toUpperCase()} <span>{league.status}</span></> : "TUS LIGAS"}</div>
        <div className="header-actions">
          <button className="icon-button" onClick={toggleDark} aria-label="Cambiar tema">{appData.dark ? "☀" : "◐"}</button>
          {league && <>
            <button className="ghost-button" onClick={backToLeagues}>← Ligas</button>
            <button className="ghost-button" onClick={exportCurrentLeague}>Exportar</button>
            <button className="ghost-button" onClick={() => importRef.current?.click()}>Importar</button>
            <input ref={importRef} className="sr-only" type="file" accept="application/json" onChange={importSingleLeagueFile} />
          </>}
        </div>
      </header>
      {league ? (
        <DraftBoard league={league} onChange={handleLeagueChange} />
      ) : (
        <LeagueSelector leagues={summaries} onCreate={handleCreate} onOpen={openLeague} onDuplicate={handleDuplicate} onDelete={handleDelete} onExportAll={exportAllLeagues} onImportFile={importLeaguesFile} />
      )}
      <footer><span>Guardado automático en este dispositivo</span>{league && <span>{league.teams.length} equipos · ${league.config.budget} · {league.config.slots.length} slots</span>}</footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
