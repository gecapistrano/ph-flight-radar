const STOPS = [
  { label: "GND", color: "#f87171" },
  { label: "10k", color: "#fb923c" },
  { label: "23k", color: "#facc15" },
  { label: "33k", color: "#4ade80" },
  { label: "FL390", color: "#38bdf8" },
];

export function AltitudeLegend() {
  return (
    <div className="pointer-events-none absolute bottom-10 left-3 z-10 rounded-md border border-slate-700/80 bg-slate-950/75 px-3 py-2 backdrop-blur-sm md:bottom-8">
      <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-slate-500">
        Altitude
      </div>
      <div
        className="h-1.5 w-36 rounded-full"
        style={{
          background:
            "linear-gradient(to right, #f87171, #fb923c, #facc15, #4ade80, #38bdf8)",
        }}
      />
      <div className="mt-1 flex justify-between text-[9px] font-mono text-slate-400">
        {STOPS.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}
