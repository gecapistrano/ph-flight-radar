"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Flight } from "@/lib/opensky";

export interface FlightsPayload {
  time: number;
  count: number;
  airborne: number;
  onGround: number;
  countries: number;
  medianAltitude: number | null;
  flights: Flight[];
}

const POLL_MS = 15_000;

export function useFlights() {
  const [data, setData] = useState<FlightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/flights", { signal: controller.signal });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const payload = (await res.json()) as FlightsPayload;
      setData(payload);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      // An abort is a deliberate supersede, not a failure worth showing.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `refresh` is async, so no state is set before this effect returns; the
    // lint rule cannot see past the promise. Fetching on mount is the point of
    // the hook, so there is nothing to lift out.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const id = setInterval(() => {
      // Pause polling while the tab is hidden; OpenSky credits are finite.
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return { data, error, loading, updatedAt, refresh };
}
