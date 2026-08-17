"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { money } from "../lib/formulas";
import { searchKey } from "../lib/text";
import type { League, Player } from "../lib/types";

type RankedPlayer = { player: Player; rank: number; key: string };
type Option = RankedPlayer & { taken: { teamName: string; price: number } | null };

export default function PlayerCombobox({ value, onChange, league, players, id, placeholder, disabled }: { value: string; onChange: (value: string) => void; league: League; players: Player[]; id: string; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const purchaseByKey = useMemo(() => {
    const map = new Map<string, { teamName: string; price: number }>();
    league.purchases.forEach((purchase) => {
      const team = league.teams.find((item) => item.id === purchase.teamId);
      map.set(searchKey(purchase.playerName), { teamName: team?.name || "", price: purchase.price });
    });
    return map;
  }, [league.purchases, league.teams]);

  const rankedPlayers: RankedPlayer[] = useMemo(() => {
    const counters = new Map<string, number>();
    return players.map((player) => {
      const rank = (counters.get(player.posicion) || 0) + 1;
      counters.set(player.posicion, rank);
      return { player, rank, key: searchKey(player.nombre) };
    });
  }, [players]);

  const results: Option[] = useMemo(() => {
    // The board can mount well over 100 comboboxes. Only the focused one should perform search work.
    if (!open) return [];
    const query = searchKey(value);
    const withStatus = rankedPlayers.map((item) => ({ ...item, taken: purchaseByKey.get(item.key) || null }));
    const filtered = query ? withStatus.filter((item) => item.key.includes(query)) : withStatus;
    return filtered.sort((a, b) => (a.taken ? 1 : 0) - (b.taken ? 1 : 0) || a.player.posicion.localeCompare(b.player.posicion) || a.rank - b.rank).slice(0, 40);
  }, [open, value, purchaseByKey, rankedPlayers]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectPlayer = (name: string) => { onChange(name); setOpen(false); };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setHighlight((current) => Math.min(results.length - 1, current + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(0, current - 1)); }
    else if (event.key === "Escape") { setOpen(false); }
    else if (event.key === "Enter") {
      const target = results[highlight];
      if (open && target && !target.taken) { event.preventDefault(); selectPlayer(target.player.nombre); }
    }
  };

  return (
    <div className="combobox" ref={containerRef}>
      <input
        aria-label="Jugador"
        className="field player-field"
        id={id}
        value={value}
        placeholder={placeholder || "Jugador"}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onChange={(event) => { onChange(event.target.value); setHighlight(0); setOpen(true); }}
        onFocus={() => { setHighlight(0); setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      {open && results.length > 0 && (
        <ul className="combobox-list" id={`${id}-listbox`} role="listbox">
          {results.map((item, index) => (
            <li
              key={item.player.nombre}
              role="option"
              aria-selected={index === highlight}
              aria-disabled={!!item.taken}
              className={`combobox-option ${index === highlight ? "active" : ""} ${item.taken ? "taken" : ""}`}
              onMouseDown={(event) => { event.preventDefault(); if (!item.taken) selectPlayer(item.player.nombre); }}
            >
              <span className="combobox-pos">{item.player.posicion}</span>
              <span className="combobox-name">{item.player.nombre}</span>
              {item.taken ? <span className="combobox-taken">VENDIDO · {item.taken.teamName} · {money(item.taken.price)}</span> : <span className="combobox-rank">#{item.rank}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
