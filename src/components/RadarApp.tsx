"use client";

import { useMemo, useState } from "react";

import { AltitudeLegend } from "@/components/AltitudeLegend";
import { FlightList } from "@/components/FlightList";
import { FlightMap } from "@/components/FlightMap";
import { useFlights } from "@/hooks/useFlights";
import { formatAltitude, formatHeading, formatRate, formatSpeed } from "@/lib/format";
import { metresToFeet } from "@/lib/opensky";

type Filter = "all" | "airborne" | "ground";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="font-mono text-lg font-semibold tabular-nums tracking-tight text-slate-100 sm:text-xl">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
    </div>
  );
}

export default function RadarApp() {
  const { data, error, loading, refresh } = useFlights();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const flights = useMemo(() => data?.flights ?? [], [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return flights
      .filter((f) => {
        if (filter === "airborne" && f.onGround) return false;
        if (filter === "ground" && !f.onGround) return false;
        if (q.length === 0) return true;
        return (
          (f.callsign ?? "").toLowerCase().includes(q) ||
          f.icao24.toLowerCase().includes(q) ||
          f.originCountry.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.altitude ?? -1) - (a.altitude ?? -1));
  }, [flights, filter, query]);

  const selected = flights.find((f) => f.icao24 === selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <h1 className="text-sm font-semibold tracking-wide">PH Flight Radar</h1>
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-300">
              Philippine FIR
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Live ADS-B traffic · OpenSky Network
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-4 sm:gap-6">
          <Stat label="Tracked" value={String(data?.count ?? "—")} />
          <Stat label="Airborne" value={String(data?.airborne ?? "—")} />
          <Stat label="Operators" value={String(data?.countries ?? "—")} />
          <Stat
            label="Median alt"
            value={
              data?.medianAltitude != null
                ? `${Math.round(metresToFeet(data.medianAltitude) / 1000)}k ft`
                : "—"
            }
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="flex h-[40vh] min-h-0 w-full shrink-0 flex-col border-t border-slate-800 md:h-auto md:w-[26rem] md:border-t-0 md:border-r">
          <div className="shrink-0 space-y-2 border-b border-slate-800 p-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search callsign, ICAO24, or country"
              className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
            />
            <div className="flex gap-1">
              {(["all", "airborne", "ground"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] capitalize transition-colors ${
                    filter === f
                      ? "bg-sky-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !data ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Contacting OpenSky…
              </p>
            ) : error && !data ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-rose-400">{error}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
                >
                  Retry
                </button>
              </div>
            ) : (
              <FlightList
                flights={visible}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>

          {selected && (
            <div className="shrink-0 border-t border-slate-800 bg-slate-900/80 p-4 text-xs">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-mono text-base font-semibold">
                  {selected.callsign ?? selected.icao24.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-slate-500 hover:text-slate-300"
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-slate-400">
                <dt>Altitude</dt>
                <dd className="text-right font-mono text-slate-200">
                  {formatAltitude(selected.altitude)}
                </dd>
                <dt>Ground speed</dt>
                <dd className="text-right font-mono text-slate-200">
                  {formatSpeed(selected.velocity)}
                </dd>
                <dt>Heading</dt>
                <dd className="text-right font-mono text-slate-200">
                  {formatHeading(selected.heading)}
                </dd>
                <dt>Vertical</dt>
                <dd className="text-right font-mono text-slate-200">
                  {formatRate(selected.verticalRate)}
                </dd>
                <dt>Origin</dt>
                <dd className="text-right text-slate-200">{selected.originCountry}</dd>
                <dt>ICAO24</dt>
                <dd className="text-right font-mono text-slate-200">{selected.icao24}</dd>
              </dl>
              <a
                href={`https://opensky-network.org/aircraft-profile?icao24=${selected.icao24}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sky-400 hover:underline"
              >
                Aircraft profile on OpenSky →
              </a>
            </div>
          )}

          <div className="shrink-0 border-t border-slate-800 px-4 py-2 text-[10px] text-slate-600">
            {data
              ? "Live OpenSky feed · refreshes every 15s while this tab is open"
              : "—"}
            {error && data && (
              <span className="text-amber-500"> · showing last good data</span>
            )}
          </div>
        </aside>

        <main className="relative min-h-[58vh] flex-1">
          <div className="absolute inset-0">
            <FlightMap flights={visible} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-md border border-slate-700/80 bg-slate-950/75 px-3 py-2 backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">In view</div>
            <div className="font-mono text-sm text-slate-100">
              {visible.length} aircraft
              <span className="text-slate-500"> · FIR box</span>
            </div>
          </div>
          <AltitudeLegend />
        </main>
      </div>
    </div>
  );
}
