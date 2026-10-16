import bundled from './routes/swargate.json';
import type { Coordinate } from './model/geometry';

export const CENTER: Coordinate = [73.8682, 18.4636];
export const SEED = 2026;
export const MODEL_INTERVAL_MS = 100;
export const UI_INTERVAL_MS = 500;
export const GRID_INTERVAL_MS = 5000;
export const VERSION = '1.0.0';
export const MULTILINGUAL_ENABLED = false;
const cartoApiKey = process.env.EXPO_PUBLIC_CARTO_API_KEY?.trim();
export const MAP_TILE_URL = cartoApiKey
  ? `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoApiKey)}`
  : null;
export type Scenario = 'busy' | 'school' | 'park' | 'highway' | 'clean';
export interface Zone {
  id: string;
  name: string;
  kind: 'school' | 'hospital' | 'park';
  center: Coordinate;
  radius: number;
}
const schoolRoad = bundled.routes[2].coordinates;
export const ZONES: Zone[] = [
  {
    id: 'banyan',
    name: 'Banyan Tree School',
    kind: 'school',
    center: schoolRoad[Math.floor(schoolRoad.length * 0.67)] as Coordinate,
    radius: 160,
  },
  {
    id: 'riverside-school',
    name: 'Riverside Public School',
    kind: 'school',
    center: [73.8615, 18.4792],
    radius: 140,
  },
  {
    id: 'hospital',
    name: 'Riverside Hospital',
    kind: 'hospital',
    center: [73.8725, 18.4881],
    radius: 130,
  },
  { id: 'park', name: 'Gulmohar Park', kind: 'park', center: [73.8813, 18.4721], radius: 320 },
];
export const DESTINATIONS = [
  { id: 'swargate', name: 'Swargate', coordinate: [73.8636, 18.5018] as Coordinate },
  { id: 'katraj', name: 'Katraj', coordinate: [73.8554, 18.4529] as Coordinate },
  { id: 'market', name: 'Market Yard', coordinate: [73.8786, 18.4869] as Coordinate },
  { id: 'station', name: 'Pune Station', coordinate: [73.8743, 18.5286] as Coordinate },
] as const;
