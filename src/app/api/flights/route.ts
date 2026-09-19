import { setDefaultResultOrder } from "node:dns";
import { NextResponse } from "next/server";

import { fetchFlights } from "@/lib/opensky";

// Vercel often resolves OpenSky to IPv6 first; those connections hang, then
// the function dies with FUNCTION_INVOCATION_TIMEOUT. Prefer IPv4.
setDefaultResultOrder("ipv4first");

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Server-side proxy for the OpenSky state-vector API.
 *
 * The browser never calls OpenSky directly, for three reasons: OpenSky sends no
 * CORS headers, the anonymous tier is billed per request so one shared
 * server-side cache is far cheaper than one budget per visitor, and this is
 * where credentials would live if the deployment is ever upgraded to an
 * authenticated tier.
 *
 * Responses are cached briefly because OpenSky itself only refreshes the
 * anonymous feed every few seconds; polling faster spends credits for
 * identical data.
 */

const CACHE_MS = 10_000;

let cache: { at: number; body: unknown } | null = null;
/** Shared in-flight request, so concurrent visitors trigger only one upstream call. */
let inFlight: Promise<unknown> | null = null;

async function load() {
  const snapshot = await fetchFlights();

  const airborne = snapshot.flights.filter((f) => !f.onGround);
  const altitudes = airborne
    .map((f) => f.altitude)
    .filter((a): a is number => a !== null);

  return {
    time: snapshot.time,
    count: snapshot.flights.length,
    airborne: airborne.length,
    onGround: snapshot.flights.length - airborne.length,
    countries: new Set(snapshot.flights.map((f) => f.originCountry)).size,
    medianAltitude:
      altitudes.length > 0
        ? altitudes.sort((a, b) => a - b)[Math.floor(altitudes.length / 2)]
        : null,
    flights: snapshot.flights,
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json(cache.body, {
        headers: {
          "x-cache": "hit",
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
        },
    });
  }

  try {
    inFlight ??= load().finally(() => {
      inFlight = null;
    });

    const body = await inFlight;
    cache = { at: Date.now(), body };

    return NextResponse.json(body, {
      headers: {
        "x-cache": "miss",
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (error) {
    // Serving stale data beats an empty map when OpenSky rate-limits us.
    if (cache) {
      return NextResponse.json(cache.body, {
        headers: {
          "x-cache": "stale",
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=20",
        },
      });
    }

    const raw = error instanceof Error ? error.message : "Unknown error";
    const message = /timed out|aborted|fetch failed|connection failed|upstream/i.test(raw)
      ? "Live traffic timed out. The feed is slow or unreachable from this server."
      : raw;
    console.error("[api/flights]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
