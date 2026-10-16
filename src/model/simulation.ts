import type { FeatureCollection, Polygon } from 'geojson';
import { CENTER, SEED, ZONES, type Scenario } from '../config';
import bundled from '../routes/swargate.json';
import { clamp, getAir, cleanAirScore, cleanerPercent } from './air';
import { distance, distanceToSegment, offset, positionAlong, type Coordinate } from './geometry';

export interface FieldContext {
  scenario: Scenario;
  schoolRush: boolean;
  seed: number;
}
export const DEFAULT_FIELD: FieldContext = { scenario: 'busy', schoolRush: false, seed: SEED };
const roadSegments: [Coordinate, Coordinate][] = [];
for (const route of bundled.routes) {
  for (let index = 1; index < route.coordinates.length; index += 1) {
    roadSegments.push([
      route.coordinates[index - 1] as Coordinate,
      route.coordinates[index] as Coordinate,
    ]);
  }
}
// Indexed by 200 m tiles, so 3,600 field samples do not each scan every road vertex.
const roadIndex = new Map<string, [Coordinate, Coordinate][]>();
function tile(position: Coordinate) {
  return [
    Math.floor(((position[0] - CENTER[0]) * 105550) / 200),
    Math.floor(((position[1] - CENTER[1]) * 111320) / 200),
  ];
}
for (const segment of roadSegments) {
  const first = tile(segment[0]);
  const second = tile(segment[1]);
  for (let x = Math.min(first[0], second[0]) - 1; x <= Math.max(first[0], second[0]) + 1; x += 1) {
    for (
      let y = Math.min(first[1], second[1]) - 1;
      y <= Math.max(first[1], second[1]) + 1;
      y += 1
    ) {
      const key = `${x}:${y}`;
      const entries = roadIndex.get(key) ?? [];
      entries.push(segment);
      roadIndex.set(key, entries);
    }
  }
}

export function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededValue(x: number, y: number, seed = SEED) {
  return mulberry32(Math.imul(x + seed, 374761393) ^ Math.imul(y + 1, 668265263))();
}
function smoothNoise(x: number, y: number, seed: number) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fx = (x - left) ** 2 * (3 - 2 * (x - left));
  const fy = (y - top) ** 2 * (3 - 2 * (y - top));
  const upper = seededValue(left, top, seed) * (1 - fx) + seededValue(left + 1, top, seed) * fx;
  const lower =
    seededValue(left, top + 1, seed) * (1 - fx) + seededValue(left + 1, top + 1, seed) * fx;
  return upper * (1 - fy) + lower * fy;
}

export function diurnal(hour: number) {
  const points = [
    [0, 1.1],
    [4, 0.9],
    [9, 1.6],
    [15, 0.7],
    [20, 1.8],
    [24, 1.1],
  ];
  const normalized = ((hour % 24) + 24) % 24;
  for (let index = 1; index < points.length; index += 1) {
    if (normalized <= points[index][0]) {
      const [start, value] = points[index - 1];
      const [end, nextValue] = points[index];
      return value + ((nextValue - value) * (normalized - start)) / (end - start);
    }
  }
  return 1.1;
}

export function fieldPm25(position: Coordinate, date: Date, context: FieldContext): number {
  const east = (position[0] - CENTER[0]) * 105550;
  const north = (position[1] - CENTER[1]) * 111320;
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const factor = 0.7 + 0.6 * smoothNoise(east / 450, north / 450, context.seed);
  const scenarioFactor = { busy: 1, school: 1.25, park: 0.65, highway: 1.6, clean: 0.25 }[
    context.scenario
  ];
  let pm25 = 55 * diurnal(hour) * factor * scenarioFactor;
  const nearSegments = roadIndex.get(tile(position).join(':')) ?? [];
  let roadDistance = Infinity;
  for (const [start, end] of nearSegments)
    roadDistance = Math.min(roadDistance, distanceToSegment(position, start, end));
  const arterialDistance = Math.min(Math.abs(east), Math.abs(north - 1200));
  if (Math.min(roadDistance, arterialDistance) < 60) pm25 += (30 + 30 * factor) * scenarioFactor;
  const signalPhase = (((date.getTime() / 1000) % 90) + 90) % 90;
  const signalPoints: Coordinate[] = [
    [73.8607, 18.4819],
    [73.862, 18.493],
    [73.8794, 18.4879],
  ];
  for (const signal of signalPoints) {
    if (distance(position, signal) < 140 && signalPhase < 40)
      pm25 += (40 + 80 * factor) * scenarioFactor;
  }
  // Shared traffic hotspot on the Satara corridor. It affects the map and rider too.
  const hotspotEast = (position[0] - 73.8576) * 105550;
  const hotspotNorth = (position[1] - 18.491) * 111320;
  pm25 +=
    235 *
    Math.exp(-(hotspotEast ** 2 / (2 * 220 ** 2) + hotspotNorth ** 2 / (2 * 950 ** 2))) *
    scenarioFactor;
  const weekday = date.getDay() > 0 && date.getDay() < 6;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const schoolHours =
    weekday && ((minutes >= 465 && minutes <= 510) || (minutes >= 810 && minutes <= 855));
  for (const zone of ZONES) {
    const meters = distance(position, zone.center);
    if (zone.kind === 'park' && meters <= zone.radius) pm25 *= 0.5;
    if (zone.kind === 'hospital' && meters < zone.radius) pm25 += 30 * scenarioFactor;
    if (zone.kind === 'school' && meters <= zone.radius + 70) {
      if (schoolHours || context.schoolRush) pm25 += (80 + 70 * factor) * scenarioFactor;
      // The rehearsed school has dirty air before arrival; clean conditions remove it.
      if (zone.id === 'banyan' && context.scenario !== 'clean' && context.scenario !== 'park')
        pm25 += 90;
    }
  }
  return clamp(pm25, 6, 380);
}

export function hourlyProfile(position: Coordinate, date: Date, context: FieldContext) {
  const value = fieldPm25(position, date, context);
  const hourKey = Math.floor(date.getTime() / 3600000);
  const cellX = Math.floor(((position[0] - CENTER[0]) * 105550) / 100);
  return value * (0.92 + 0.16 * seededValue(cellX, hourKey, context.seed));
}
export function forecast(
  position: Coordinate,
  now: Date,
  context: FieldContext,
  currentPm25: number,
) {
  const baseline = hourlyProfile(position, now, context);
  const deviation = baseline > 0 ? currentPm25 / baseline : 1;
  const hours = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(now.getTime() + index * 3600000);
    const pm25 = clamp(
      hourlyProfile(position, date, context) * (1 + (deviation - 1) * Math.exp(-index / 3)),
      6,
      380,
    );
    hours.push({ timeMs: date.getTime(), air: getAir(pm25) });
  }
  return hours;
}
export function cleanestHour(position: Coordinate, now: Date, context: FieldContext) {
  const first = new Date(now);
  const tomorrow = now.getHours() >= 18;
  if (tomorrow) {
    first.setDate(first.getDate() + 1);
    first.setHours(6, 0, 0, 0);
  } else first.setHours(now.getHours(), 0, 0, 0);
  let bestMs = first.getTime();
  let minimum = Infinity;
  for (
    let date = new Date(first);
    date.getHours() < 18;
    date = new Date(date.getTime() + 3600000)
  ) {
    const value = hourlyProfile(position, date, context);
    if (value < minimum) {
      minimum = value;
      bestMs = date.getTime();
    }
  }
  return { timeMs: bestMs, tomorrow };
}

export function spikeMultiplier(elapsedSeconds: number) {
  if (elapsedSeconds < 0 || elapsedSeconds >= 55) return 1;
  if (elapsedSeconds < 15) return 1 + (1.6 * elapsedSeconds) / 15;
  return 1 + 1.6 * (1 - (elapsedSeconds - 15) / 40);
}
export interface Exposure {
  seconds: number;
  outsideIntegral: number;
  insideIntegral: number;
  helmetSeconds: number;
  cleanSeconds: number;
  schoolSeconds: number;
  distanceMeters: number;
  strips: { outside: number; inside: number | null; seconds: number }[];
}
export function emptyExposure(): Exposure {
  return {
    seconds: 0,
    outsideIntegral: 0,
    insideIntegral: 0,
    helmetSeconds: 0,
    cleanSeconds: 0,
    schoolSeconds: 0,
    distanceMeters: 0,
    strips: [],
  };
}
export function integrateExposure(
  previous: Exposure,
  sample: {
    seconds: number;
    outside: number;
    inside: number | null;
    fanPct: number;
    school: boolean;
    distanceMeters: number;
  },
): Exposure {
  if (sample.seconds <= 0 || !Number.isFinite(sample.seconds)) return previous;
  const result = { ...previous, strips: previous.strips.map((strip) => ({ ...strip })) };
  result.seconds += sample.seconds;
  result.outsideIntegral += sample.outside * sample.seconds;
  if (sample.inside !== null) {
    result.helmetSeconds += sample.seconds;
    result.insideIntegral += sample.inside * sample.seconds;
    if (sample.fanPct > 0 && sample.inside < sample.outside) result.cleanSeconds += sample.seconds;
  }
  if (sample.school) result.schoolSeconds += sample.seconds;
  result.distanceMeters += Math.max(0, sample.distanceMeters);
  const outside = getAir(sample.outside).band;
  const inside = sample.inside === null ? null : getAir(sample.inside).band;
  const last = result.strips[result.strips.length - 1];
  if (last && last.outside === outside && last.inside === inside) last.seconds += sample.seconds;
  else result.strips.push({ outside, inside, seconds: sample.seconds });
  // A demo can run indefinitely without accumulating one allocation per model tick.
  if (result.strips.length > 240) {
    const first = result.strips.shift()!;
    result.strips[0].seconds += first.seconds;
  }
  return result;
}
export function summarize(exposure: Exposure) {
  const outside = exposure.seconds > 0 ? exposure.outsideIntegral / exposure.seconds : 0;
  const inside =
    exposure.helmetSeconds > 0 ? exposure.insideIntegral / exposure.helmetSeconds : null;
  return {
    ...exposure,
    outside: getAir(outside),
    inside: inside === null ? null : getAir(inside),
    cleaner: inside === null ? null : cleanerPercent(inside, outside),
    score: inside === null ? null : Math.round(cleanAirScore(inside)),
    breaths: inside === null ? null : Math.floor((exposure.cleanSeconds / 60) * 14),
  };
}

export interface Movement {
  meters: number;
  stopSeconds: number;
  nextSignal: number;
}
export function advanceRide(
  previous: Movement,
  seconds: number,
  multiplier: number,
  length: number,
): Movement {
  if (previous.stopSeconds > 0)
    return { ...previous, stopSeconds: Math.max(0, previous.stopSeconds - seconds) };
  const meters = Math.min(length, previous.meters + (25 / 3.6) * multiplier * seconds);
  const signalMeters = (length * previous.nextSignal) / 4;
  if (previous.nextSignal <= 3 && meters >= signalMeters)
    return { meters: signalMeters, nextSignal: previous.nextSignal + 1, stopSeconds: 20 };
  return { ...previous, meters };
}

export const GRID_GEOMETRY: FeatureCollection<
  Polygon,
  { id: number; pm25: number; color: string }
> = {
  type: 'FeatureCollection',
  features: [],
};
for (let y = 0; y < 60; y += 1) {
  for (let x = 0; x < 60; x += 1) {
    const bottomLeft = offset(CENTER, (x - 30) * 100, (y - 30) * 100);
    const topRight = offset(bottomLeft, 100, 100);
    GRID_GEOMETRY.features.push({
      type: 'Feature',
      id: y * 60 + x,
      properties: { id: y * 60 + x, pm25: 0, color: '#F2C230' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            bottomLeft,
            [topRight[0], bottomLeft[1]],
            topRight,
            [bottomLeft[0], topRight[1]],
            bottomLeft,
          ],
        ],
      },
    });
  }
}
export function getCellCenter(id: number) {
  return offset(CENTER, ((id % 60) - 29.5) * 100, (Math.floor(id / 60) - 29.5) * 100);
}
export function fleetPositions(elapsedSeconds: number) {
  const positions: Coordinate[] = [];
  for (let index = 0; index < 40; index += 1) {
    const random = mulberry32(SEED + index);
    const radius = 250 + random() * 1900;
    const speed = (15 + random() * 20) / 3.6;
    const angle = random() * Math.PI * 2 + (elapsedSeconds * speed) / radius;
    positions.push(offset(CENTER, radius * Math.cos(angle), radius * Math.sin(angle) * 0.7));
  }
  return positions;
}
export function lookAhead(
  coordinates: Coordinate[],
  lengths: number[],
  meters: number,
  date: Date,
  context: FieldContext,
) {
  let worstPosition = positionAlong(coordinates, lengths, meters + 50);
  let worst = getAir(
    fieldPm25(worstPosition, new Date(date.getTime() + (50 / (25 / 3.6)) * 1000), context),
  );
  for (let ahead = 100; ahead <= 300; ahead += 50) {
    const position = positionAlong(coordinates, lengths, meters + ahead);
    const air = getAir(
      fieldPm25(position, new Date(date.getTime() + (ahead / (25 / 3.6)) * 1000), context),
    );
    if (air.aqi > worst.aqi) {
      worst = air;
      worstPosition = position;
    }
  }
  const zoneId =
    ZONES.find(
      (zone) => zone.kind !== 'park' && distance(worstPosition, zone.center) <= zone.radius + 70,
    )?.id ?? null;
  const cellKey = `${Math.floor(((worstPosition[0] - CENTER[0]) * 105550) / 100)}:${Math.floor(((worstPosition[1] - CENTER[1]) * 111320) / 100)}`;
  return { air: worst, zoneId, cellKey };
}
