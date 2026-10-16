export const BAND_COLORS = [
  '#1B9E4B',
  '#8BC34A',
  '#F2C230',
  '#F28C28',
  '#E53935',
  '#8E1B3A',
] as const;
export type Band = 0 | 1 | 2 | 3 | 4 | 5;
export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'co';
export interface Air {
  pm25: number;
  pm10: number;
  no2: number;
  co: number;
  aqi: number;
  band: Band;
  cause: Pollutant;
}
export const BREAKPOINTS: Record<Pollutant, readonly (readonly [number, number])[]> = {
  pm25: [
    [0, 30],
    [31, 60],
    [61, 90],
    [91, 120],
    [121, 250],
    [251, 380],
  ],
  pm10: [
    [0, 50],
    [51, 100],
    [101, 250],
    [251, 350],
    [351, 430],
    [431, 510],
  ],
  no2: [
    [0, 40],
    [41, 80],
    [81, 180],
    [181, 280],
    [281, 400],
    [401, 500],
  ],
  co: [
    [0, 1],
    [1.1, 2],
    [2.1, 10],
    [10.1, 17],
    [17.1, 34],
    [34.1, 50],
  ],
};
const INDEX_BREAKPOINTS = [
  [0, 50],
  [51, 100],
  [101, 200],
  [201, 300],
  [301, 400],
  [401, 500],
] as const;

export function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
export function lerp(start: number, end: number, fraction: number) {
  return start + (end - start) * fraction;
}
export function approach(current: number, target: number, seconds: number, timeConstant: number) {
  return lerp(current, target, 1 - Math.exp(-Math.max(0, seconds) / timeConstant));
}

export function subIndex(pollutant: Pollutant, concentration: number): number {
  const intervals = BREAKPOINTS[pollutant];
  const maximum = intervals[5][1];
  // Prototype convention: quantize before selecting the integer table interval.
  // This is a presentation model, not a validated instantaneous AQI method.
  const digits = pollutant === 'co' ? 10 : 1;
  const rounded = Math.round(clamp(concentration, 0, maximum) * digits) / digits;
  for (let index = 0; index < intervals.length; index += 1) {
    const [low, high] = intervals[index];
    if (rounded <= high) {
      const [indexLow, indexHigh] = INDEX_BREAKPOINTS[index];
      return Math.round(lerp(indexLow, indexHigh, clamp((rounded - low) / (high - low), 0, 1)));
    }
  }
  return 500;
}

export function bandForAqi(aqi: number): Band {
  if (aqi <= 50) return 0;
  if (aqi <= 100) return 1;
  if (aqi <= 200) return 2;
  if (aqi <= 300) return 3;
  if (aqi <= 400) return 4;
  return 5;
}

export function getAir(pm25: number): Air {
  const concentrations = {
    pm25: clamp(pm25, 0, 380),
    pm10: clamp(1.7 * pm25 + 10, 0, 510),
    no2: clamp(25 + 0.5 * pm25, 0, 500),
    co: clamp(0.6 + 0.012 * pm25, 0, 50),
  };
  let aqi = 0;
  let cause: Pollutant = 'pm25';
  for (const pollutant of ['pm25', 'pm10', 'no2', 'co'] as const) {
    const index = subIndex(pollutant, concentrations[pollutant]);
    if (index > aqi) {
      aqi = index;
      cause = pollutant;
    }
  }
  return { ...concentrations, aqi, cause, band: bandForAqi(aqi) };
}

export interface SensorState {
  packetBase: number;
  base: number;
  factor: number;
}
export function updateSensor(
  previous: SensorState,
  raw: number,
  packetBase: number,
  seconds: number,
  minimum = 0.9,
): SensorState {
  if (packetBase === 0) return { packetBase: 0, base: 0, factor: 1 };
  let base = packetBase !== previous.packetBase ? packetBase : previous.base;
  if (raw < base) base = approach(base, raw, seconds, 60);
  const target = base > 0 ? clamp(1 + 1.2 * (raw / base - 1), minimum, 4) : 1;
  return { packetBase, base, factor: approach(previous.factor, target, seconds, 2) };
}

export function fanEfficiency(fanPct: number) {
  return fanPct <= 0 ? 0.08 : 0.55 + (0.33 * clamp(fanPct, 0, 100)) / 100;
}
export function insidePm25(
  current: number,
  outside: number,
  fanPct: number,
  seconds: number,
  noise = 0,
  insideFactor = 1,
) {
  const target = Math.max(
    6,
    outside * (1 - fanEfficiency(fanPct)) * insideFactor + clamp(noise, -1.5, 1.5),
  );
  return clamp(approach(current, target, seconds, fanPct > 0 ? 8 : 20), 6, 380);
}
export function cleanerPercent(inside: number, outside: number) {
  return outside > 0 ? clamp(100 * (1 - inside / outside), 0, 100) : 0;
}
export function cleanAirScore(averageInside: number) {
  return clamp(100 * (1 - averageInside / 60), 0, 100);
}

export interface DisplayAir {
  air: Air;
  lastBandMs: number;
}
export function smoothAir(
  previous: DisplayAir,
  targetPm25: number,
  seconds: number,
  nowMs: number,
  spike: boolean,
): DisplayAir {
  let concentration = approach(previous.air.pm25, targetPm25, seconds, 0.65);
  let next = getAir(concentration);
  if (!spike) {
    const allowedSteps = nowMs - previous.lastBandMs >= 1000 ? 1 : 0;
    const minimumBand = Math.max(0, previous.air.band - allowedSteps);
    const maximumBand = Math.min(5, previous.air.band + allowedSteps);
    if (next.band < minimumBand || next.band > maximumBand) {
      let low = 0;
      let high = 380;
      const desiredBand = next.band > maximumBand ? maximumBand : minimumBand;
      for (let index = 0; index < 18; index += 1) {
        const middle = (low + high) / 2;
        if (getAir(middle).band <= desiredBand - (next.band < minimumBand ? 1 : 0)) low = middle;
        else high = middle;
      }
      concentration =
        next.band > maximumBand ? Math.max(0, low - 0.001) : Math.min(380, high + 0.001);
      next = getAir(concentration);
    }
  }
  return { air: next, lastBandMs: next.band === previous.air.band ? previous.lastBandMs : nowMs };
}
