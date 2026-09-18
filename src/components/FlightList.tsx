"use client";

import { formatAltitude, formatSpeed } from "@/lib/format";
import type { Flight } from "@/lib/opensky";

function VerticalTrend({ rate }: { rate: number | null }) {
  if (rate === null || Math.abs(rate) < 0.5) {
    return <span className="text-slate-500" title="Level flight">→</span>;
  }
  return rate > 0 ? (
    <span className="text-emerald-400" title="Climbing">↑</span>
  ) : (
    <span className="text-sky-400" title="Descending">↓</span>
  );
}

interface Props {
  flights: Flight[];
  selectedId: string | null;
  onSelect: (icao24: string) => void;
}

export function FlightList({ flights, selectedId, onSelect }: Props) {
  if (flights.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        No aircraft match the current filter.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-1.5 text-[9px] uppercase tracking-[0.16em] text-slate-600">
        <span className="w-[4.5rem] shrink-0">Callsign</span>
        <span className="min-w-0 flex-1">Origin</span>
        <span className="w-16 shrink-0 text-right">Alt</span>
        <span className="w-14 shrink-0 text-right">Spd</span>
        <span className="w-3 shrink-0" />
      </div>
      <ul className="divide-y divide-slate-800">
        {flights.map((flight) => {
          const selected = flight.icao24 === selectedId;
          return (
            <li key={flight.icao24}>
              <button
                type="button"
                onClick={() => onSelect(flight.icao24)}
                aria-current={selected}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  selected ? "bg-sky-500/15" : "hover:bg-slate-800/60"
                }`}
              >
                <span className="w-[4.5rem] shrink-0 font-mono text-xs font-semibold text-slate-100">
                  {flight.callsign ?? flight.icao24.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                  {flight.originCountry}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-slate-300">
                  {formatAltitude(flight.altitude)}
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-300">
                  {formatSpeed(flight.velocity)}
                </span>
                <span className="w-3 shrink-0 text-center text-xs">
                  <VerticalTrend rate={flight.verticalRate} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
