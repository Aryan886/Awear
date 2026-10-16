import { describe, expect, it } from 'vitest';
import {
  BREAKPOINTS,
  cleanAirScore,
  cleanerPercent,
  fanEfficiency,
  getAir,
  insidePm25,
  smoothAir,
  subIndex,
  updateSensor,
  type Pollutant,
} from './air';

describe('consistent AQI and sensor model', () => {
  for (const pollutant of ['pm25', 'pm10', 'no2', 'co'] as Pollutant[]) {
    it(`${pollutant}: every table endpoint maps exactly`, () => {
      const expected = [
        [0, 50],
        [51, 100],
        [101, 200],
        [201, 300],
        [301, 400],
        [401, 500],
      ];
      BREAKPOINTS[pollutant].forEach(([low, high], index) => {
        expect(subIndex(pollutant, low)).toBe(expected[index][0]);
        expect(subIndex(pollutant, high)).toBe(expected[index][1]);
      });
      expect(subIndex(pollutant, -10)).toBe(0);
      expect(subIndex(pollutant, 10000)).toBe(500);
    });
  }
  it('rounds before selecting an interval and uses the worst pollutant', () => {
    expect(subIndex('pm25', 30.49)).toBe(50);
    expect(subIndex('pm25', 30.5)).toBe(51);
    expect(subIndex('co', 1.04)).toBe(50);
    expect(subIndex('co', 1.06)).toBe(51);
    const air = getAir(24);
    expect(air.aqi).toBe(
      Math.max(
        subIndex('pm25', 24),
        subIndex('pm10', air.pm10),
        subIndex('no2', air.no2),
        subIndex('co', air.co),
      ),
    );
    expect(air.band).toBe(1); // The derived PM10 rounds to 51, so this is Good, not hard-coded Great.
  });
  it('computes score and cleaner percentage with zero guards', () => {
    expect(cleanAirScore(24)).toBe(60);
    expect(cleanAirScore(90)).toBe(0);
    expect(cleanerPercent(20, 0)).toBe(0);
    expect(cleanerPercent(24, 108)).toBeCloseTo(77.7777);
  });
  it('follows baseline downward, resets on calibration and guards zero base', () => {
    let sensor = updateSensor({ packetBase: 980, base: 980, factor: 1 }, 500, 980, 60);
    expect(sensor.base).toBeLessThan(980);
    const previousBase = sensor.base;
    sensor = updateSensor(sensor, 1100, 980, 60);
    expect(sensor.base).toBe(previousBase);
    sensor = updateSensor(sensor, 1100, 1100, 60);
    expect(sensor.base).toBe(1100);
    expect(updateSensor({ packetBase: 0, base: 0, factor: 1 }, 1000, 0, 1).factor).toBe(1);
    expect(updateSensor({ packetBase: 980, base: 980, factor: 4 }, 1000, 0, 0.1).factor).toBe(1);
  });
  it('uses confirmed duty with a lag and a single fan-removal factor', () => {
    expect(fanEfficiency(70)).toBeCloseTo(0.781);
    expect(insidePm25(108, 108, 70, 800, 0, 1)).toBeCloseTo(23.652);
    expect(insidePm25(108, 108, 0, 800)).toBeCloseTo(99.36);
  });
  it('limits normal display band changes while allowing a spike', () => {
    let previous = { air: getAir(10), lastBandMs: 0 };
    const before = previous.air.band;
    previous = smoothAir(previous, 380, 5, 1200, false);
    expect(previous.air.band - before).toBeLessThanOrEqual(1);
    const next = smoothAir(previous, 380, 5, 1300, false);
    expect(next.air.band).toBe(previous.air.band);
    expect(smoothAir(previous, 380, 5, 1300, true).air.band).toBe(5);
  });
});
