"use client";

import Link from "next/link";
import CreateLeagueForm from "./components/CreateLeagueForm";
import Shell from "./components/Shell";

export default function Home() {
  return (
    <Shell headerRight={<Link className="ghost-button" href="/mis-ligas">📁 Mis ligas</Link>}>
      <section className="page-shell">
        <div className="landing-hero">
          <span className="eyebrow">Plataforma pública de subastas · Fantasy Football</span>
          <h1>Auction War Room</h1>
          <p>Crea una liga, configura equipos y presupuesto, y administra tu Draft Board de subasta en vivo. Cada liga que crees queda guardada de forma independiente en este dispositivo.</p>
        </div>

        <CreateLeagueForm />

        <div className="landing-links"><Link href="/mis-ligas" className="ghost-button">📁 Ver mis ligas guardadas</Link></div>
      </section>
    </Shell>
  );
}
