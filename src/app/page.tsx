"use client";

import dynamic from "next/dynamic";

const RadarApp = dynamic(() => import("@/components/RadarApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-slate-950 text-sm text-slate-500">
      Spinning up radar…
    </div>
  ),
});

export default function Page() {
  return <RadarApp />;
}
