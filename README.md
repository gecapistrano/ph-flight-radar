# PH Flight Radar

Live ADS-B traffic over the Philippine Flight Information Region. Positions
come from the [OpenSky Network](https://opensky-network.org/) open state-vector
API; the browser never talks to OpenSky directly.

Aircraft are coloured by altitude, rotated to their track, and listed beside
the map so you can search a callsign and jump to it.

**Live demo:** [ph-flight-radar.vercel.app](https://ph-flight-radar.vercel.app)

---

## Why a server-side proxy

OpenSky does not send CORS headers, so a browser client cannot call it.
The anonymous tier is also billed per request: one shared cache on the server
is cheaper and kinder than one budget per visitor. `/api/flights` coalesces
in-flight requests, keeps a 10-second cache, and serves the last good snapshot
if OpenSky rate-limits us.

OpenSky reports SI units. The UI converts to feet and knots at the
presentation layer only.

---

## Stack

| Area | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Map | MapLibre GL, OpenFreeMap (no API key) |
| Data | OpenSky Network REST, Philippine FIR bounding box |

---

## Running

```bash
git clone https://github.com/gecapistrano/ph-flight-radar.git
cd ph-flight-radar
npm install
npm run dev
```

Open <http://localhost:3000>. No environment variables are required.

The map polls every 15 seconds while the tab is visible, and pauses when it
is not, so background tabs do not spend OpenSky credits.

---

## Controls

- Click an aircraft on the map or in the list to select it.
- Search by callsign, ICAO24 hex, or origin country.
- Filter to airborne or on-ground traffic.
- Altitude colour: red near the ground through blue at cruise (FL390).

---

## Attribution

Aircraft positions: [OpenSky Network](https://opensky-network.org/).
Basemap: [OpenFreeMap](https://openfreemap.org/), © OpenStreetMap contributors.

This is not an operational ATC display. Coverage depends on volunteer ADS-B
receivers and is thinner away from major airports.

## License

MIT. See [LICENSE](LICENSE).
