import { setDefaultResultOrder } from "node:dns";
import { NextResponse } from "next/server";

import { fetchFlights } from "@/lib/opensky";

// Vercel often resolves OpenSky to IPv6 first; those connections hang, then
// the function dies with FUNCTION_INVOCATION_TIMEOUT. Prefer IPv4.
setDefaultResultOrder("ipv4first");

// `force-dynamic` makes Vercel overwrite Cache-Control, so every visitor
// would hit the upstream ADS-B APIs. Leave the route dynamic (Next 16 GET
// default) and cache at the CDN via the response header below.
export const maxDuration = 20;

/**
 * Server-side proxy for live ADS-B state vectors.
 *
 * The browser never calls OpenSky or adsb.lol directly: those APIs send no
 * CORS headers, the anonymous OpenSky tier is billed per request, and this is
 * where credentials would live if the deployment is ever upgraded.
 *
 * Responses are cached briefly because the anonymous feeds only refresh every
 * few seconds; polling faster spends credits for identical data.
 */

const CACHE_MS = 10_000;
const CACHE_CONTROL = "public, s-maxage=10, stale-while-revalidate=60";

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
        "Cache-Control": CACHE_CONTROL,
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
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    // Serving stale data beats an empty map when the upstream feed is unhappy.
    if (cache) {
      return NextResponse.json(cache.body, {
        headers: {
          "x-cache": "stale",
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=60",
        },
      });
    }

    const raw = error instanceof Error ? error.message : "Unknown error";
    const rateLimited = /429/.test(raw);
    const timedOut = /timed out|aborted|fetch failed|connection failed|upstream/i.test(
      raw
    );
    const message = rateLimited
      ? "Live traffic rate-limited this server. The map will retry automatically."
      : timedOut
        ? "Live traffic timed out. The feed is slow or unreachable from this server."
        : raw;
    console.error("[api/flights]", message);
    return NextResponse.json(
      { error: message },
      {
        status: rateLimited ? 429 : 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
