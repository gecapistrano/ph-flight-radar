"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";

import { AIRPORTS } from "@/lib/airports";
import { altitudeColor } from "@/lib/format";
import { PH_BOUNDS, type Flight } from "@/lib/opensky";

import "maplibre-gl/dist/maplibre-gl.css";

/** OpenFreeMap Liberty: keyless, no watermark, land is actually visible. */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const AIRPORT_SOURCE = "airports";
const FIR_SOURCE = "fir";

const PLANE_SVG = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
  <path fill="currentColor" d="M16 2.2l2.1 8.4 10.2 6.3v2.5l-10.2-2.4v6.8l4.4 3.4v1.9L16 26.6 9.5 29.1v-1.9l4.4-3.4v-6.8L3.7 19.4v-2.5l10.2-6.3L16 2.2z"/>
</svg>`;

type MarkerEntry = {
  marker: Marker;
  root: HTMLButtonElement;
  plane: HTMLElement;
  label: HTMLElement;
};

function airportsGeoJSON(): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: AIRPORTS.map((a) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.longitude, a.latitude] },
      properties: { iata: a.iata, name: a.name },
    })),
  };
}

function firGeoJSON() {
  const { lomin, lamin, lomax, lamax } = PH_BOUNDS;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [lomin, lamin],
          [lomax, lamin],
          [lomax, lamax],
          [lomin, lamax],
          [lomin, lamin],
        ],
      ],
    },
  };
}

function paintMarker(
  entry: MarkerEntry,
  flight: Flight,
  selected: boolean,
  zoom: number
) {
  const color = altitudeColor(flight.altitude);
  entry.root.classList.toggle("is-selected", selected);
  entry.root.classList.toggle("is-ground", flight.onGround);
  entry.root.style.zIndex = selected ? "4" : "1";
  entry.root.setAttribute("aria-label", flight.callsign ?? flight.icao24.toUpperCase());
  entry.plane.style.color = color;
  entry.plane.style.transform = `rotate(${flight.heading ?? 0}deg)`;
  entry.label.textContent = flight.callsign ?? flight.icao24.toUpperCase();
  entry.label.hidden = !selected && zoom < 6.1;
  entry.marker.setLngLat([flight.longitude, flight.latitude]);
}

interface Props {
  flights: Flight[];
  selectedId: string | null;
  onSelect: (icao24: string | null) => void;
}

export function FlightMap({ flights, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const syncRef = useRef<(next: Flight[], selected: string | null) => void>(() => {});

  const onSelectRef = useRef(onSelect);
  const flightsRef = useRef(flights);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    flightsRef.current = flights;
    selectedIdRef.current = selectedId;
  }, [flights, selectedId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [122, 12.5],
      zoom: 5.2,
      attributionControl: { compact: true },
    });

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    const resize = () => map.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);
    resize();

    const syncMarkers = (nextFlights: Flight[], nextSelected: string | null) => {
      const seen = new Set<string>();

      for (const flight of nextFlights) {
        seen.add(flight.icao24);
        let entry = markersRef.current.get(flight.icao24);
        if (!entry) {
          const root = document.createElement("button");
          root.type = "button";
          root.className = "ac-marker";

          const plane = document.createElement("span");
          plane.className = "ac-plane";
          plane.innerHTML = PLANE_SVG;

          const label = document.createElement("span");
          label.className = "ac-callsign";

          root.append(plane, label);
          const icao24 = flight.icao24;
          root.addEventListener("click", (event) => {
            event.stopPropagation();
            onSelectRef.current(icao24);
          });

          const marker = new Marker({
            element: root,
            anchor: "center",
            pitchAlignment: "viewport",
            rotationAlignment: "viewport",
          })
            .setLngLat([flight.longitude, flight.latitude])
            .addTo(map);

          entry = { marker, root, plane, label };
          markersRef.current.set(flight.icao24, entry);
        }
        paintMarker(entry, flight, flight.icao24 === nextSelected, map.getZoom());
      }

      for (const [id, entry] of markersRef.current) {
        if (seen.has(id)) continue;
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    };

    syncRef.current = syncMarkers;
    readyRef.current = true;
    syncMarkers(flightsRef.current, selectedIdRef.current);

    const decorateBasemap = () => {
      map.resize();
      map.fitBounds(
        [
          [PH_BOUNDS.lomin, PH_BOUNDS.lamin],
          [PH_BOUNDS.lomax, PH_BOUNDS.lamax],
        ],
        { padding: 36, duration: 0 }
      );

      if (map.getSource(FIR_SOURCE)) return;

      try {
        map.addSource(FIR_SOURCE, { type: "geojson", data: firGeoJSON() });
        map.addLayer({
          id: "fir-fill",
          type: "fill",
          source: FIR_SOURCE,
          paint: { "fill-color": "#0284c7", "fill-opacity": 0.05 },
        });
        map.addLayer({
          id: "fir-line",
          type: "line",
          source: FIR_SOURCE,
          paint: {
            "line-color": "#0369a1",
            "line-opacity": 0.55,
            "line-width": 1.25,
            "line-dasharray": [2, 2],
          },
        });

        map.addSource(AIRPORT_SOURCE, { type: "geojson", data: airportsGeoJSON() });
        map.addLayer({
          id: "airport-dots",
          type: "circle",
          source: AIRPORT_SOURCE,
          paint: {
            "circle-radius": 3.5,
            "circle-color": "#0f172a",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#f8fafc",
          },
        });
        map.addLayer({
          id: "airport-labels",
          type: "symbol",
          source: AIRPORT_SOURCE,
          layout: {
            "text-field": ["get", "iata"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-offset": [0, 1.05],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#1e293b",
            "text-halo-color": "#f8fafc",
            "text-halo-width": 1.6,
          },
        });
      } catch {
        // Basemap annotations are optional; aircraft markers still mount below.
      }
    };

    if (map.loaded()) decorateBasemap();
    else map.once("load", decorateBasemap);

    map.on("zoomend", () => {
      syncRef.current(flightsRef.current, selectedIdRef.current);
    });

    map.on("click", (event) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(".ac-marker")) return;
      onSelectRef.current(null);
    });

    return () => {
      readyRef.current = false;
      syncRef.current = () => {};
      for (const entry of markersRef.current.values()) entry.marker.remove();
      markersRef.current.clear();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    syncRef.current(flights, selectedId);
  }, [flights, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;

    const match = flights.find((f) => f.icao24 === selectedId);
    if (!match) return;

    map.resize();
    map.easeTo({
      center: [match.longitude, match.latitude],
      zoom: Math.min(Math.max(map.getZoom(), 5.8), 7),
      duration: 700,
    });
    // Only recentre when the selection changes, not on every position refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={containerRef} className="h-full min-h-[58vh] w-full md:min-h-0" />;
}
