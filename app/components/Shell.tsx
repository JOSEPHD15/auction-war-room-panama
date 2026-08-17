"use client";

import Image from "next/image";
import { ReactNode, useEffect, useState } from "react";
import { ensureMigrated, getOrInitAppData, saveAppData } from "../lib/storage";

export default function Shell({ headerCenter, headerRight, backHref, backLabel, footerRight, children }: { headerCenter?: ReactNode; headerRight?: ReactNode; backHref?: string; backLabel?: string; footerRight?: ReactNode; children: ReactNode }) {
  const [dark, setDark] = useState(() => typeof window === "undefined" ? true : getOrInitAppData().dark);

  useEffect(() => {
    ensureMigrated();
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
        <a href="/" className="brand" aria-label="Auction War Room — inicio">
          <span className="brand-mark brand-mark-image"><Image src="/draftlab-logo.jpeg" alt="" width={38} height={38} priority /></span>
          <span><b>DRAFT LAB</b><small>AUCTION WAR ROOM</small></span>
        </a>
        <div className="public-title">{headerCenter}</div>
        <div className="header-actions">
          {backHref && <a className="ghost-button" href={backHref}>{backLabel || "← Volver"}</a>}
          {headerRight}
          <button className="icon-button theme-toggle" onClick={toggleDark} aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}>{dark ? "☀" : "●"}</button>
        </div>
      </header>
      {children}
      <footer><span><i className="save-indicator" /> Guardado automático</span>{footerRight}</footer>
    </main>
  );
}
