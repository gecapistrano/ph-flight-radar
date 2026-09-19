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

async function fetchOpenSky(url: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ph-flight-radar/1.0 (+https://github.com/gecapistrano/ph-flight-radar)",
        },
        signal: signal ?? AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenSky request failed");
}

export async function fetchFlights(signal?: AbortSignal): Promise<FlightSnapshot> {
  const params = new URLSearchParams({
    lamin: String(PH_BOUNDS.lamin),
    lomin: String(PH_BOUNDS.lomin),
    lamax: String(PH_BOUNDS.lamax),
    lomax: String(PH_BOUNDS.lomax),
  });

  const res = await fetchOpenSky(
    `https://opensky-network.org/api/states/all?${params}`,
    signal
  );

  if (!res.ok) {
    // 429 is the common one: the anonymous tier has a daily credit budget.
    throw new Error(`OpenSky responded ${res.status}`);
  }

  const body = (await res.json()) as { time: number; states: StateVector[] | null };

  const flights = (body.states ?? [])
    .map(toFlight)
    .filter((f): f is Flight => f !== null);

  return { time: body.time, flights };
}

/* ── Unit conversions ──────────────────────────────────────────────────────
 * OpenSky reports SI units. Aviation reads feet and knots, so convert at the
 * presentation layer only.
 * ------------------------------------------------------------------------ */

export const metresToFeet = (m: number) => m * 3.280839895;
export const mpsToKnots = (mps: number) => mps * 1.943844492;
