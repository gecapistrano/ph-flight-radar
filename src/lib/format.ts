import { metresToFeet, mpsToKnots } from "@/lib/opensky";

export function formatAltitude(metres: number | null) {
  if (metres === null) return "—";
  return `${Math.round(metresToFeet(metres) / 100) * 100} ft`;
}

export function formatSpeed(mps: number | null) {
  if (mps === null) return "—";
  return `${Math.round(mpsToKnots(mps))} kt`;
}

export function formatHeading(deg: number | null) {
  if (deg === null) return "—";
  return `${Math.round(deg) % 360}°`;
}

export function formatRate(mps: number | null) {
  if (mps === null || Math.abs(mps) < 0.5) return "Level";
  const fpm = Math.round(mps * 196.850394);
  return fpm > 0 ? `Climb ${fpm} fpm` : `Descent ${Math.abs(fpm)} fpm`;
}

/** Altitude colour used by both the map markers and the legend. */
export function altitudeColor(metres: number | null): string {
  const ft = metres == null ? 0 : metresToFeet(metres);
  if (ft < 10_000) return "#f87171";
  if (ft < 23_000) return "#fb923c";
  if (ft < 33_000) return "#facc15";
  if (ft < 39_000) return "#4ade80";
  return "#38bdf8";
}
