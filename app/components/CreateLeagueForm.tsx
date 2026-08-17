"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_BUDGET, DEFAULT_MINIMUM_BID, DEFAULT_SCORING, SCORING_PRESETS } from "../lib/formulas";
import { createLeague } from "../lib/leagues";
import { saveLeague } from "../lib/storage";

export default function CreateLeagueForm({ title }: { title?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [teamCount, setTeamCount] = useState(10);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [minimumBid, setMinimumBid] = useState(DEFAULT_MINIMUM_BID);
  const [scoring, setScoring] = useState(DEFAULT_SCORING);

  const submit = () => {
    const league = saveLeague(createLeague({ name: name || "Nueva Liga", season, teamCount, budget, minimumBid, scoring }));
    router.push(`/liga/${league.id}`);
  };

  return (
    <div className="league-settings create-league-card">
      <div className="settings-head"><div><span className="eyebrow">Nueva liga</span><h2>{title || "Crear liga"}</h2><p>Lista en menos de un minuto.</p></div><span className="setup-badge">Setup rápido</span></div>
      <div className="field-grid create-field-grid">
        <label className="form-field field-wide"><span>Nombre de la liga</span><input autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Liga de los domingos" /></label>
        <label className="form-field"><span>Temporada</span><input value={season} onChange={(event) => setSeason(event.target.value)} /></label>
        <label className="form-field"><span>Equipos</span><input type="number" min="2" max="16" value={teamCount} onChange={(event) => setTeamCount(Math.min(16, Math.max(2, Number(event.target.value) || 2)))} /></label>
        <label className="form-field"><span>Presupuesto</span><input type="number" min="1" value={budget} onChange={(event) => setBudget(Math.max(1, Number(event.target.value) || 1))} /></label>
        <label className="form-field"><span>Puja mínima</span><input type="number" min="0" value={minimumBid} onChange={(event) => setMinimumBid(Math.max(0, Number(event.target.value) || 0))} /></label>
        <label className="form-field"><span>Puntuación</span><input value={scoring} onChange={(event) => setScoring(event.target.value)} list="scoring-presets" /><datalist id="scoring-presets">{SCORING_PRESETS.map((preset) => <option key={preset} value={preset} />)}</datalist></label>
      </div>
      <div className="preset-summary"><span>Roster inicial</span><b>QB · 2 RB · 2 WR · TE · FLEX · K · DEF · 5 Banca</b></div>
      <div className="settings-actions create-actions"><p className="form-note">Podrás editar todo antes de iniciar.</p><button className="save-button primary-cta" onClick={submit}>Crear mi liga <span>→</span></button></div>
    </div>
  );
}
