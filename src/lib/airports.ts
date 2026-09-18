/**
 * Major Philippine airports, used as map labels so traffic has geography
 * to sit against. Coordinates are aerodrome reference points.
 */
export interface Airport {
  icao: string;
  iata: string;
  name: string;
  longitude: number;
  latitude: number;
}

export const AIRPORTS: Airport[] = [
  { icao: "RPLL", iata: "MNL", name: "Manila", longitude: 121.0194, latitude: 14.5086 },
  { icao: "RPLC", iata: "CRK", name: "Clark", longitude: 120.5597, latitude: 15.186 },
  { icao: "RPVM", iata: "CEB", name: "Cebu", longitude: 123.9794, latitude: 10.3075 },
  { icao: "RPMD", iata: "DVO", name: "Davao", longitude: 125.6458, latitude: 7.1255 },
  { icao: "RPVI", iata: "ILO", name: "Iloilo", longitude: 122.4934, latitude: 10.833 },
  { icao: "RPVP", iata: "PPS", name: "Palawan", longitude: 118.7587, latitude: 9.7421 },
  { icao: "RPVA", iata: "TAC", name: "Tacloban", longitude: 125.0278, latitude: 11.2276 },
  { icao: "RPMR", iata: "GES", name: "GenSan", longitude: 125.096, latitude: 6.058 },
  { icao: "RPLI", iata: "LAO", name: "Laoag", longitude: 120.5319, latitude: 18.1781 },
  { icao: "RPMZ", iata: "ZAM", name: "Zamboanga", longitude: 122.0596, latitude: 6.9224 },
];
