"use client";

import { ChangeEvent, useRef, useState } from "react";
import type { LeagueSummary } from "../lib/types";

export type CreateLeagueInput = { name: string; season: string; teamCount: number; budget: number; minimumBid: number };

type Props = {
  leagues: LeagueSummary[];
  onCreate: (input: CreateLeagueInput) => void;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExportAll: () => void;
  onImportFile: (file: File) => void;
};

const STATUS_LABEL: Record<string, string> = { "PRE-DRAFT": "Pre-Draft", LIVE: "En vivo", FINALIZADO: "Finalizado" };
const STATUS_CLASS: Record<string, string> = { "PRE-DRAFT": "status-pre", LIVE: "status-live", FINALIZADO: "status-done" };

export default function LeagueSelector({ leagues, onCreate, onOpen, onDuplicate, onDelete, onExportAll, onImportFile }: Props) {
  const [creating, setCreating] = useState(leagues.length === 0);
  const [name, setName] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [teamCount, setTeamCount] = useState(10);
  const [budget, setBudget] = useState(200);
  const [minimumBid, setMinimumBid] = useState(1);
  const importRef = useRef<HTMLInputElement>(null);

  const submitCreate = () => {
    if (!name.trim()) return;
    onCreate({ name, season, teamCount, budget, minimumBid });
    setCreating(false);
    setName("");
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImportFile(file);
    event.target.value = "";
  };

  return (
    <section className="page-shell">
      <div className="page-intro">
        <div>
          <span className="eyebrow">Auction War Room</span>
          <h1>Tus ligas</h1>
          <p>Elige una liga guardada en este dispositivo o crea una nueva. Cada liga guarda sus propios equipos, compras e historial.</p>
        </div>
        <div className="intro-actions">
          <button className="ghost-button" onClick={onExportAll} disabled={!leagues.length}>Exportar todas</button>
          <button className="ghost-button" onClick={() => importRef.current?.click()}>Importar</button>
          <input ref={importRef} className="sr-only" type="file" accept="application/json" onChange={handleImport} />
          <button className="save-button" onClick={() => setCreating((value) => !value)}>{creating ? "Cancelar" : "+ Nueva liga"}</button>
        </div>
      </div>

      {creating && (
        <div className="league-settings">
          <div className="settings-head"><div><span className="eyebrow">Nueva liga</span><h2>Configuración inicial</h2></div></div>
          <div className="field-grid">
            <label className="form-field"><span>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Liga Panamá 2026" /></label>
            <label className="form-field"><span>Temporada</span><input value={season} onChange={(event) => setSeason(event.target.value)} /></label>
            <label className="form-field"><span>Equipos</span><input type="number" min="2" max="16" value={teamCount} onChange={(event) => setTeamCount(Math.min(16, Math.max(2, Number(event.target.value) || 2)))} /></label>
            <label className="form-field"><span>Presupuesto</span><input type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="form-field"><span>Puja mínima</span><input type="number" min="0" value={minimumBid} onChange={(event) => setMinimumBid(Math.max(0, Number(event.target.value) || 0))} /></label>
          </div>
          <div className="settings-actions"><button className="save-button" onClick={submitCreate}>Crear liga</button></div>
        </div>
      )}

      {leagues.length ? (
        <div className="league-grid">
          {leagues.map((league) => (
            <article className="team-card league-card" key={league.id}>
              <div className="team-card-head"><h3>{league.name}</h3><span className={`status-pill ${STATUS_CLASS[league.status]}`}>{STATUS_LABEL[league.status]}</span></div>
              <div className="stat-line"><span>Temporada <b>{league.season}</b></span><span>Equipos <b>{league.teams}</b></span></div>
              <div className="league-actions">
                <button className="save-button" onClick={() => onOpen(league.id)}>Abrir</button>
                <button className="ghost-button" onClick={() => onDuplicate(league.id)}>Duplicar</button>
                <button className="danger-button" onClick={() => { if (confirm(`¿Eliminar la liga "${league.name}"? Esta acción no se puede deshacer.`)) onDelete(league.id); }}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      ) : !creating ? (
        <div className="empty-state"><b>Todavía no tienes ligas guardadas</b><span>Crea tu primera liga para empezar el draft.</span></div>
      ) : null}
    </section>
  );
}
