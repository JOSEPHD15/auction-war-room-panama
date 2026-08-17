"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { renameLeague } from "../lib/draftStatus";
import { downloadJSON } from "../lib/download";
import { duplicateLeague, exportAllLeaguesPayload, exportLeaguePayload, parseImportFile, withFreshId } from "../lib/leagues";
import { deleteLeague, listLeagueSummaries, loadLeague, saveLeague } from "../lib/storage";
import type { LeagueSummary } from "../lib/types";
import CreateLeagueForm from "./CreateLeagueForm";

const STATUS_LABEL: Record<string, string> = { "PRE-DRAFT": "Pre-Draft", LIVE: "En vivo", FINALIZADO: "Finalizado" };
const STATUS_CLASS: Record<string, string> = { "PRE-DRAFT": "status-pre", LIVE: "status-live", FINALIZADO: "status-done" };

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("es-PA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

export default function LeagueLibrary() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = () => setLeagues(listLeagueSummaries());
  useEffect(refresh, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleDuplicate = (id: string) => {
    const source = loadLeague(id);
    if (!source) { setToast("No se pudo duplicar la liga."); return; }
    saveLeague(duplicateLeague(source));
    refresh();
    setToast("Liga duplicada.");
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`¿Eliminar la liga "${name}"? Esta acción no se puede deshacer.`)) return;
    deleteLeague(id);
    refresh();
    setToast("Liga eliminada.");
  };

  const handleExportExcel = async (id: string) => {
    const league = loadLeague(id);
    if (!league) { setToast("No se pudo exportar la liga."); return; }
    const { downloadLeagueExcel } = await import("../lib/exportExcel");
    downloadLeagueExcel(league);
    setToast("Excel exportado.");
  };

  const handleExportJson = (id: string, name: string) => {
    const league = loadLeague(id);
    if (!league) { setToast("No se pudo exportar la liga."); return; }
    downloadJSON(exportLeaguePayload(league), `${name.replace(/\s+/g, "-").toLowerCase()}.json`);
    setToast("Respaldo JSON exportado.");
  };

  const handleExportAll = () => {
    const all = leagues.map((summary) => loadLeague(summary.id)).filter((item) => !!item);
    downloadJSON(exportAllLeaguesPayload(all), `auction-war-room-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setToast("Todas las ligas exportadas.");
  };

  const handleImportFile = async (file: File) => {
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
    refresh();
    setToast(`${imported} liga(s) importada(s).`);
  };

  const handleImportInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) handleImportFile(file);
  };

  const startRename = (summary: LeagueSummary) => { setRenamingId(summary.id); setRenameValue(summary.name); };
  const confirmRename = (id: string) => {
    const league = loadLeague(id);
    if (league) { saveLeague(renameLeague(league, renameValue)); refresh(); setToast("Liga renombrada."); }
    setRenamingId(null);
  };

  return (
    <section className="page-shell">
      <div className="page-intro">
        <div><span className="eyebrow">Biblioteca local</span><h1>Mis ligas</h1><p>Ligas guardadas en este dispositivo. Solo tú puedes verlas — no aparecen en ningún directorio público.</p></div>
        <div className="intro-actions">
          <button className="ghost-button" onClick={handleExportAll} disabled={!leagues.length}>Exportar todas</button>
          <button className="ghost-button" onClick={() => importRef.current?.click()}>Importar</button>
          <input ref={importRef} className="sr-only" type="file" accept="application/json" onChange={handleImportInput} />
          <button className="save-button" onClick={() => setCreating((value) => !value)}>{creating ? "Cancelar" : "+ Nueva liga"}</button>
        </div>
      </div>

      {creating && <CreateLeagueForm />}

      {leagues.length ? (
        <div className="league-grid">
          {leagues.map((league) => (
            <article className="team-card league-card" key={league.id}>
              <div className="team-card-head">
                {renamingId === league.id ? (
                  <input className="rename-input" autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmRename(league.id); if (event.key === "Escape") setRenamingId(null); }} onBlur={() => confirmRename(league.id)} />
                ) : <h3>{league.name}</h3>}
                <span className={`status-pill ${STATUS_CLASS[league.status]}`}>{STATUS_LABEL[league.status]}</span>
              </div>
              <div className="stat-line"><span>Temporada <b>{league.season}</b></span><span>Equipos <b>{league.teams}</b></span></div>
              <p className="league-meta">Modificada {formatDate(league.updatedAt)}</p>
              <div className="league-actions">
                <button className="save-button" onClick={() => router.push(`/liga/${league.id}`)}>Abrir</button>
                <button className="ghost-button" onClick={() => startRename(league)}>Renombrar</button>
                <button className="ghost-button" onClick={() => handleDuplicate(league.id)}>Duplicar</button>
                <button className="ghost-button" onClick={() => handleExportExcel(league.id)}>📊 Excel</button>
                <button className="ghost-button" onClick={() => handleExportJson(league.id, league.name)}>JSON</button>
                <button className="danger-button" onClick={() => handleDelete(league.id, league.name)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      ) : !creating ? (
        <div className="empty-state"><b>Todavía no tienes ligas guardadas</b><span>Crea tu primera liga para empezar el draft.</span></div>
      ) : null}

      {toast && <div className="toast" role="status">{toast}</div>}
    </section>
  );
}
