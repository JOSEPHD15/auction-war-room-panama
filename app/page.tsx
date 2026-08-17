"use client";

import Link from "next/link";
import CreateLeagueForm from "./components/CreateLeagueForm";
import Shell from "./components/Shell";

export default function Home() {
  return (
    <Shell headerRight={<Link prefetch={false} className="ghost-button header-library-link" href="/mis-ligas">Mis ligas</Link>}>
      <section className="page-shell landing-shell">
        <div className="landing-grid">
          <div className="landing-copy">
            <span className="eyebrow landing-kicker"><i /> Draft night, under control</span>
            <h1>Tu subasta.<br /><span>Sin caos.</span></h1>
            <p>Controla compras, presupuestos y máxima puja desde una sala de draft diseñada para moverse rápido. Crea todas las ligas que necesites y mantén cada una completamente separada.</p>
            <div className="landing-benefits" aria-label="Ventajas principales">
              <span><b>01</b> Offline-first</span>
              <span><b>02</b> Multi-liga</span>
              <span><b>03</b> Spectator mode</span>
            </div>
            <Link prefetch={false} href="/mis-ligas" className="text-link">Abrir ligas guardadas <span>→</span></Link>
          </div>

          <div className="landing-create"><CreateLeagueForm title="Configura tu war room" /></div>
        </div>

        <div className="product-preview" aria-label="Vista previa del tablero">
          <div className="preview-topline"><span><i /> LIVE BOARD</span><small>Actualización instantánea</small></div>
          <div className="preview-grid">
            <div className="preview-pick"><small>ÚLTIMA COMPRA</small><b>Bijan Robinson</b><span>RB · Equipo 4</span><strong>$52</strong></div>
            <div className="preview-metric"><small>MÁXIMA PUJA</small><b>$74</b><span>Equipo 7</span></div>
            <div className="preview-metric"><small>PRESUPUESTO</small><b>$148</b><span>Disponible</span></div>
            <div className="preview-metric"><small>PROGRESO</small><b>36%</b><span>50 de 140 slots</span></div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
