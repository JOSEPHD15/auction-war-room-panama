"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { ensureMigrated, getOrInitAppData, saveAppData } from "../lib/storage";

export default function Shell({ headerCenter, headerRight, backHref, backLabel, footerRight, children }: { headerCenter?: ReactNode; headerRight?: ReactNode; backHref?: string; backLabel?: string; footerRight?: ReactNode; children: ReactNode }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    ensureMigrated();
    setDark(getOrInitAppData().dark);
  }, []);

  const toggleDark = () => {
    setDark((value) => {
      const next = !value;
      saveAppData({ ...getOrInitAppData(), dark: next });
      return next;
    });
  };

  return (
    <main className={dark ? "app theme-dark" : "app theme-light"}>
      <header className="topbar public-topbar">
        <Link href="/" className="brand" aria-label="Auction War Room — inicio">
          <span className="brand-mark brand-mark-image"><img src="/draftlab-logo.jpeg" alt="Draft Lab" /></span>
          <span><b>AUCTION</b><small>WAR ROOM · MULTI-LIGA</small></span>
        </Link>
        <div className="public-title">{headerCenter}</div>
        <div className="header-actions">
          {backHref && <Link className="ghost-button" href={backHref}>{backLabel || "← Volver"}</Link>}
          {headerRight}
          <button className="icon-button" onClick={toggleDark} aria-label="Cambiar tema">{dark ? "☀" : "◐"}</button>
        </div>
      </header>
      {children}
      <footer><span>Guardado automático en este dispositivo</span>{footerRight}</footer>
    </main>
  );
}
