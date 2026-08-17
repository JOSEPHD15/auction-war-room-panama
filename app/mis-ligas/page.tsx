"use client";

import LeagueLibrary from "../components/LeagueLibrary";
import Shell from "../components/Shell";

export default function MisLigasPage() {
  return (
    <Shell headerCenter="MIS LIGAS" backHref="/" backLabel="← Inicio">
      <LeagueLibrary />
    </Shell>
  );
}
