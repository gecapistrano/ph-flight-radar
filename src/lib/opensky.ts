/**
 * Client for the OpenSky Network live state-vector API.
 *
 * https://openskynetwork.github.io/opensky-api/rest.html
 *
 * OpenSky returns each aircraft as a positional array rather than an object,
 * which is compact on the wire but unreadable in application code. This module
 * is the only place that knows those indices; everything downstream uses the
 * named `Flight` type.
 */

/** Bounding box roughly covering the Philippine Flight Information Region. */
export const PH_BOUNDS = {
  lamin: 4.5,
  lomin: 116.0,
  lamax: 21.5,
  lomax: 127.0,
} as const;

export interface Flight {
  /** Unique 24-bit ICAO transponder address, lowercase hex. Stable per airframe. */
  icao24: string;
  /** Flight number as broadcast, e.g. "PAL123". Null while the crew has not set one. */
  callsign: string | null;
  originCountry: string;
  longitude: number;
  latitude: number;
  /** Barometric altitude in metres. Null when the aircraft is not reporting it. */
  altitude: number | null;
  /** Ground speed in m/s. */
  velocity: number | null;
  /** Track angle in degrees clockwise from true north. */
  heading: number | null;
  /** Vertical rate in m/s. Positive is climbing. */
  verticalRate: number | null;
  onGround: boolean;
  /** Seconds since epoch for the last position report. */
  lastContact: number;
}

export interface FlightSnapshot {
  /** Seconds since epoch, as reported by OpenSky. */
  time: number;
  flights: Flight[];
}

/** Index positions in an OpenSky state vector, per the API documentation. */
const enum S {
  Icao24 = 0,
  Callsign = 1,
  OriginCountry = 2,
  LastContact = 4,
  Longitude = 5,
  Latitude = 6,
  BaroAltitude = 7,
  OnGround = 8,
  Velocity = 9,
  TrueTrack = 10,
  VerticalRate = 11,
}

type StateVector = (number | string | boolean | null)[];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toFlight(state: StateVector): Flight | null {
  const longitude = num(state[S.Longitude]);
  const latitude = num(state[S.Latitude]);

  // An aircraft with no position cannot be drawn, so drop it here rather than
  // forcing every consumer to null-check coordinates.
  if (longitude === null || latitude === null) return null;

  const rawCallsign =
    typeof state[S.Callsign] === "string" ? (state[S.Callsign] as string).trim() : "";

  return {
    icao24: String(state[S.Icao24]),
    callsign: rawCallsign.length > 0 ? rawCallsign : null,
    originCountry: String(state[S.OriginCountry] ?? "Unknown"),
    longitude,
    latitude,
    altitude: num(state[S.BaroAltitude]),
    velocity: num(state[S.Velocity]),
    heading: num(state[S.TrueTrack]),
    verticalRate: num(state[S.VerticalRate]),
    onGround: state[S.OnGround] === true,
    lastContact: num(state[S.LastContact]) ?? 0,
  };
}

const OPEN_SKY_TIMEOUT_MS = 4_000;
const ADSB_TIMEOUT_MS = 8_000;
const OPEN_SKY_COOLDOWN_MS = 45_000;
const USER_AGENT =
  "ph-flight-radar/1.0 (+https://github.com/gecapistrano/ph-flight-radar)";

/** Skip OpenSky after a 429 or timeout so later visitors are not queued behind a dead hop. */
let openSkySkipUntil = 0;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error &&
      (error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        /aborted due to timeout/i.test(error.message)))
  );
}

async function fetchUpstream(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined =
    signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : timeout;

  try {
    return await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: combined,
      cache: "no-store",
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Upstream timed out after ${timeoutMs / 1000}s`);
    }
    const detail = error instanceof Error ? error.message : "Upstream request failed";
    throw new Error(
      detail === "fetch failed" ? "Upstream connection failed from the live server" : detail
    );
  }
}

function markOpenSkyUnavailable() {
  openSkySkipUntil = Date.now() + OPEN_SKY_COOLDOWN_MS;
}

async function fetchFromOpenSky(signal?: AbortSignal): Promise<FlightSnapshot> {
  if (Date.now() < openSkySkipUntil) {
    throw new Error("OpenSky skipped after recent rate-limit or timeout");
  }

  const params = new URLSearchParams({
    lamin: String(PH_BOUNDS.lamin),
    lomin: String(PH_BOUNDS.lomin),
    lamax: String(PH_BOUNDS.lamax),
    lomax: String(PH_BOUNDS.lomax),
  });

  try {
    const res = await fetchUpstream(
      `https://opensky-network.org/api/states/all?${params}`,
      OPEN_SKY_TIMEOUT_MS,
      signal
    );

    if (res.status === 429) {
      markOpenSkyUnavailable();
      throw new Error("OpenSky responded 429");
    }

    if (!res.ok) {
      throw new Error(`OpenSky responded ${res.status}`);
    }

    const body = (await res.json()) as { time: number; states: StateVector[] | null };

    const flights = (body.states ?? [])
      .map(toFlight)
      .filter((f): f is Flight => f !== null);

    return { time: body.time, flights };
  } catch (error) {
    if (
      error instanceof Error &&
      /timed out|429|connection failed/i.test(error.message)
    ) {
      markOpenSkyUnavailable();
    }
    throw error;
  }
}

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  seen_pos?: number;
  seen?: number;
}

function feetToMetres(ft: number) {
  return ft / 3.280839895;
}

function knotsToMps(kt: number) {
  return kt / 1.943844492;
}

function fpmToMps(fpm: number) {
  return fpm * 0.00508;
}

function toAdsbFlight(ac: AdsbAircraft): Flight | null {
  const longitude = num(ac.lon);
  const latitude = num(ac.lat);
  if (longitude === null || latitude === null) return null;

  const hex = typeof ac.hex === "string" ? ac.hex.toLowerCase() : "";
  if (!hex) return null;

  const onGround = ac.alt_baro === "ground";
  const altitude =
    typeof ac.alt_baro === "number" && Number.isFinite(ac.alt_baro)
      ? feetToMetres(ac.alt_baro)
      : null;
  const rawCallsign = typeof ac.flight === "string" ? ac.flight.trim() : "";
  const seen = num(ac.seen_pos) ?? num(ac.seen) ?? 0;

  return {
    icao24: hex,
    callsign: rawCallsign.length > 0 ? rawCallsign : null,
    originCountry: "Unknown",
    longitude,
    latitude,
    altitude: onGround ? 0 : altitude,
    velocity: num(ac.gs) !== null ? knotsToMps(ac.gs as number) : null,
    heading: num(ac.track),
    verticalRate:
      num(ac.baro_rate) !== null
        ? fpmToMps(ac.baro_rate as number)
        : num(ac.geom_rate) !== null
          ? fpmToMps(ac.geom_rate as number)
          : null,
    onGround,
    lastContact: Math.floor(Date.now() / 1000 - seen),
  };
}

async function fetchFromAdsbLol(signal?: AbortSignal): Promise<FlightSnapshot> {
  const lat = (PH_BOUNDS.lamin + PH_BOUNDS.lamax) / 2;
  const lon = (PH_BOUNDS.lomin + PH_BOUNDS.lomax) / 2;
  const res = await fetchUpstream(
    `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/650`,
    ADSB_TIMEOUT_MS,
    signal
  );

  if (res.status === 429) {
    throw new Error("adsb.lol responded 429");
  }

  if (!res.ok) {
    throw new Error(`adsb.lol responded ${res.status}`);
  }

  const body = (await res.json()) as { ac?: AdsbAircraft[] | null; now?: number };
  const flights = (body.ac ?? [])
    .map(toAdsbFlight)
    .filter((f): f is Flight => f !== null)
    .filter(
      (f) =>
        f.latitude >= PH_BOUNDS.lamin &&
        f.latitude <= PH_BOUNDS.lamax &&
        f.longitude >= PH_BOUNDS.lomin &&
        f.longitude <= PH_BOUNDS.lomax
    );

  const now = typeof body.now === "number" ? body.now : Date.now() / 1000;
  return {
    // adsb.lol reports milliseconds; OpenSky reports seconds.
    time: Math.floor(now > 1e12 ? now / 1000 : now),
    flights,
  };
}

type SourceFetcher = (signal?: AbortSignal) => Promise<FlightSnapshot>;

export async function fetchFlights(signal?: AbortSignal): Promise<FlightSnapshot> {
  // OpenSky often refuses AWS/hyperscaler IPs. Vercel runs there, so production
  // should not wait on OpenSky before trying the public adsb.lol feed.
  const onVercel = process.env.VERCEL === "1";
  const order: [string, SourceFetcher][] = onVercel
    ? [
        ["adsb.lol", fetchFromAdsbLol],
        ["OpenSky", fetchFromOpenSky],
      ]
    : [
        ["OpenSky", fetchFromOpenSky],
        ["adsb.lol", fetchFromAdsbLol],
      ];

  let lastError: unknown;
  for (let i = 0; i < order.length; i++) {
    const [name, fetchSource] = order[i];
    try {
      return await fetchSource(signal);
    } catch (error) {
      lastError = error;
      if (i < order.length - 1) {
        console.warn(
          `[flights] ${name} unavailable, trying fallback:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Live traffic sources failed");
}

/* ── Unit conversions ──────────────────────────────────────────────────────
 * OpenSky reports SI units. Aviation reads feet and knots, so convert at the
 * presentation layer only.
 * ------------------------------------------------------------------------ */

export const metresToFeet = (m: number) => m * 3.280839895;
export const mpsToKnots = (mps: number) => mps * 1.943844492;
