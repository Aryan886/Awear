import bundled from './swargate.json';
import { CENTER, DESTINATIONS } from '../config';
import { fieldPm25, type FieldContext } from '../model/simulation';
import { getAir } from '../model/air';
import { distance, positionAlong, routeLengths, type Coordinate } from '../model/geometry';

export interface Route {
  id: string;
  name: string;
  coordinates: Coordinate[];
  steps: { name: string; endMeters: number }[];
  durationSec: number;
  distanceMeters: number;
  source: 'bundled' | 'osrm';
}
export interface ScoredRoute extends Route {
  averagePm25: number;
  integratedExposure: number;
  cleaner: number;
  extraMinutes: number;
}
export const BUNDLED_ROUTES: Route[] = bundled.routes.map((route) => ({
  ...route,
  source: 'bundled',
  coordinates: route.coordinates as Coordinate[],
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function validCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
export function validateRoutes(response: unknown, destination: Coordinate): Route[] {
  if (!isRecord(response) || response.code !== 'Ok' || !Array.isArray(response.routes))
    throw new Error('OSRM response has no successful route list');
  const routes: Route[] = [];
  for (const [index, item] of response.routes.entries()) {
    if (!isRecord(item) || !isRecord(item.geometry) || !Array.isArray(item.geometry.coordinates))
      continue;
    const coordinates = item.geometry.coordinates;
    if (coordinates.length < 2 || coordinates.length > 10000 || !coordinates.every(validCoordinate))
      continue;
    if (distance(coordinates[0], CENTER) > 1500) continue;
    if (distance(coordinates[coordinates.length - 1], destination) > 1500) continue;
    if (
      typeof item.duration !== 'number' ||
      !Number.isFinite(item.duration) ||
      item.duration <= 0 ||
      typeof item.distance !== 'number' ||
      !Number.isFinite(item.distance) ||
      item.distance <= 0 ||
      !Array.isArray(item.legs) ||
      item.legs.length === 0
    )
      continue;
    const steps: Route['steps'] = [];
    let meters = 0;
    let longest = 0;
    let name = '';
    let valid = true;
    for (const leg of item.legs) {
      if (!isRecord(leg) || !Array.isArray(leg.steps) || leg.steps.length === 0) {
        valid = false;
        break;
      }
      for (const step of leg.steps) {
        if (
          !isRecord(step) ||
          typeof step.name !== 'string' ||
          typeof step.distance !== 'number' ||
          !Number.isFinite(step.distance) ||
          step.distance < 0
        ) {
          valid = false;
          break;
        }
        meters += step.distance;
        steps.push({ name: step.name || 'Bibwewadi Road', endMeters: meters });
        if (step.name && step.distance > longest) {
          longest = step.distance;
          name = step.name;
        }
      }
    }
    if (!valid || steps.length === 0 || !name) continue;
    routes.push({
      id: `osrm-${index}-${Math.round(item.distance)}-${coordinates[Math.floor(coordinates.length / 2)].join('-')}`,
      name,
      coordinates,
      steps,
      durationSec: item.duration,
      distanceMeters: item.distance,
      source: 'osrm',
    });
  }
  if (routes.length === 0)
    throw new Error('OSRM routes failed geometry, duration or step validation');
  return routes.slice(0, 3);
}

export function scoreRoutes(
  routes: Route[],
  date: Date,
  context: FieldContext,
): { routes: ScoredRoute[]; selectedId: string | null } {
  if (routes.length === 0) return { routes: [], selectedId: null };
  const fastest = routes.reduce((best, route) =>
    route.durationSec < best.durationSec ? route : best,
  );
  const scored = routes.map((route) => {
    const lengths = routeLengths(route.coordinates);
    const length = lengths[lengths.length - 1];
    const samples = Math.max(2, Math.ceil(length / 80));
    let total = 0;
    for (let index = 0; index < samples; index += 1) {
      const fraction = (index + 0.5) / samples;
      const position = positionAlong(route.coordinates, lengths, length * fraction);
      total += fieldPm25(
        position,
        new Date(date.getTime() + route.durationSec * fraction * 1000),
        context,
      );
    }
    const averagePm25 = total / samples;
    return {
      ...route,
      averagePm25,
      integratedExposure: averagePm25 * route.durationSec,
      cleaner: 0,
      extraMinutes: Math.round((route.durationSec - fastest.durationSec) / 60),
    };
  });
  const fastestAverage = scored.find((route) => route.id === fastest.id)!.averagePm25;
  let selected = scored.find((route) => route.id === fastest.id)!;
  for (const route of scored) {
    route.cleaner = fastestAverage > 0 ? 100 * (1 - route.averagePm25 / fastestAverage) : 0;
    if (route.durationSec <= fastest.durationSec + 300 && route.averagePm25 < selected.averagePm25)
      selected = route;
  }
  return { routes: scored, selectedId: selected.id };
}

export function roadName(route: Route, meters: number) {
  return (
    route.steps.find((step) => step.endMeters >= meters)?.name ??
    route.steps[route.steps.length - 1]?.name ??
    route.name
  );
}
export function routeBandSegments(route: Route, date: Date, context: FieldContext) {
  const lengths = routeLengths(route.coordinates);
  const length = lengths[lengths.length - 1];
  const segments = [];
  const count = Math.max(2, Math.ceil(length / 120));
  for (let index = 0; index < count; index += 1) {
    const start = positionAlong(route.coordinates, lengths, (length * index) / count);
    const end = positionAlong(route.coordinates, lengths, (length * (index + 1)) / count);
    const air = getAir(
      fieldPm25(
        start,
        new Date(date.getTime() + ((route.durationSec * index) / count) * 1000),
        context,
      ),
    );
    segments.push({ start, end, band: air.band });
  }
  return segments;
}

async function requestRoutes(points: Coordinate[], destination: Coordinate, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  try {
    if (signal.aborted) throw new Error('Route request cancelled');
    const url = `https://router.project-osrm.org/route/v1/driving/${points.map((point) => point.join(',')).join(';')}?alternatives=3&overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    return validateRoutes(await response.json(), destination);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

export async function fetchRoutes(
  destinationId: string,
  signal: AbortSignal,
  origin = CENTER,
): Promise<Route[]> {
  const destination = DESTINATIONS.find((item) => item.id === destinationId);
  if (!destination) throw new Error(`Unknown destination ${destinationId}`);
  let routes = await requestRoutes(
    [origin, destination.coordinate],
    destination.coordinate,
    signal,
  );
  if (routes.length >= 2) return routes;
  const first = routes[0];
  const middle = first.coordinates[Math.floor(first.coordinates.length / 2)];
  const alternatives = await requestRoutes(
    [origin, [middle[0] + 400 / 105550, middle[1]], destination.coordinate],
    destination.coordinate,
    signal,
  );
  routes = [...routes, ...alternatives.filter((route) => route.name !== first.name)].slice(0, 3);
  if (routes.length < 2) throw new Error('OSRM supplied fewer than two distinct alternatives');
  return routes;
}

// Each destination/session owns a generation. Late network replies cannot replace an active ride.
export class RouteRequest {
  private generation = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }
  async load(destinationId: string, loader = fetchRoutes): Promise<Route[] | null> {
    this.cancel();
    const generation = this.generation;
    this.controller = new AbortController();
    try {
      const routes = await loader(destinationId, this.controller.signal);
      return generation === this.generation ? routes : null;
    } catch (error) {
      if (generation !== this.generation) return null;
      throw error;
    } finally {
      if (generation === this.generation) this.controller = null;
    }
  }
}
