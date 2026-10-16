import { describe, expect, it } from 'vitest';
import {
  advanceRide,
  cleanestHour,
  DEFAULT_FIELD,
  emptyExposure,
  fieldPm25,
  forecast,
  GRID_GEOMETRY,
  integrateExposure,
  lookAhead,
  mulberry32,
  spikeMultiplier,
  summarize,
} from './simulation';
import { distance, positionAlong, routeLengths } from './geometry';
import { BUNDLED_ROUTES, scoreRoutes } from '../routes/routeService';
import { CENTER, ZONES } from '../config';
import { getAir } from './air';

describe('one deterministic field', () => {
  const date = new Date(2026, 9, 16, 15, 0);
  it('replays the same seed and fixed clock independently of rendering', () => {
    const first = mulberry32(2026);
    const second = mulberry32(2026);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
    const value = fieldPm25(CENTER, date, DEFAULT_FIELD);
    for (let index = 0; index < 20; index += 1) fieldPm25(ZONES[3].center, date, DEFAULT_FIELD);
    expect(fieldPm25(CENTER, date, DEFAULT_FIELD)).toBe(value);
    expect(GRID_GEOMETRY.features).toHaveLength(3600);
  });
  it('places the rehearsed school on the selected road route with a shared dirty field', () => {
    const routes = scoreRoutes(BUNDLED_ROUTES, date, DEFAULT_FIELD);
    const route = routes.routes.find((item) => item.id === routes.selectedId)!;
    const lengths = routeLengths(route.coordinates);
    expect(Math.min(...route.coordinates.map((point) => distance(point, ZONES[0].center)))).toBe(0);
    const schoolAir = getAir(fieldPm25(ZONES[0].center, date, DEFAULT_FIELD));
    expect(schoolAir.band).toBeGreaterThanOrEqual(4);
    const cleanAir = getAir(
      fieldPm25(ZONES[0].center, date, { ...DEFAULT_FIELD, scenario: 'clean' }),
    );
    expect(cleanAir.band).toBeLessThanOrEqual(1);
    let maxBand = 0;
    for (let meters = 0; meters < lengths[lengths.length - 1]; meters += 100)
      maxBand = Math.max(
        maxBand,
        lookAhead(route.coordinates, lengths, meters, date, DEFAULT_FIELD).air.band,
      );
    expect(maxBand).toBeGreaterThanOrEqual(4);
  });
  it('bounds the spike separately from alert cooldown', () => {
    expect(spikeMultiplier(0)).toBe(1);
    expect(spikeMultiplier(15)).toBe(2.6);
    expect(spikeMultiplier(55)).toBe(1);
    expect(spikeMultiplier(500)).toBe(1);
  });
  it('looks for a daytime clean window tomorrow after 18:00 and rolls forecast dates', () => {
    const evening = new Date(2026, 9, 16, 23, 30);
    const clean = cleanestHour(CENTER, evening, DEFAULT_FIELD);
    const date = new Date(clean.timeMs);
    expect(clean.tomorrow).toBe(true);
    expect(date.getDate()).toBe(17);
    expect(date.getHours()).toBeGreaterThanOrEqual(6);
    expect(date.getHours()).toBeLessThan(18);
    const hours = forecast(CENTER, evening, DEFAULT_FIELD, 100);
    expect(new Date(hours[1].timeMs).getDate()).toBe(17);
    const lateAfternoon = cleanestHour(CENTER, new Date(2026, 9, 16, 17, 45), DEFAULT_FIELD);
    expect(lateAfternoon.tomorrow).toBe(false);
    expect(new Date(lateAfternoon.timeMs).getHours()).toBe(17);
  });
});

describe('ride movement and integration', () => {
  it('interpolates route endpoints, repeated vertices and empty geometry', () => {
    const coordinates: [number, number][] = [
      [73, 18],
      [73, 18],
      [73.01, 18],
    ];
    const lengths = routeLengths(coordinates);
    expect(positionAlong(coordinates, lengths, -1)).toEqual(coordinates[0]);
    expect(positionAlong(coordinates, lengths, 5000)).toEqual(coordinates[2]);
    expect(positionAlong(coordinates, lengths, lengths[2] / 2)[0]).toBeCloseTo(73.005);
    expect(() => positionAlong([], [], 0)).toThrow('empty');
  });
  it('accelerates only distance and waits 20 real seconds at signals', () => {
    const start = { meters: 0, stopSeconds: 0, nextSignal: 1 };
    expect(advanceRide(start, 1, 4, 5000).meters).toBeCloseTo(
      advanceRide(start, 1, 1, 5000).meters * 4,
    );
    const stopped = advanceRide({ meters: 1249, stopSeconds: 0, nextSignal: 1 }, 1, 4, 5000);
    expect(stopped.stopSeconds).toBe(20);
    expect(advanceRide(stopped, 10, 10, 5000).meters).toBe(stopped.meters);
  });
  it('uses time-weighted exposure, score and breaths from real elapsed seconds', () => {
    let exposure = emptyExposure();
    exposure = integrateExposure(exposure, {
      seconds: 10,
      outside: 100,
      inside: 10,
      fanPct: 70,
      school: true,
      distanceMeters: 100,
    });
    exposure = integrateExposure(exposure, {
      seconds: 30,
      outside: 200,
      inside: 30,
      fanPct: 0,
      school: false,
      distanceMeters: 200,
    });
    const result = summarize(exposure);
    expect(result.outside.pm25).toBe(175);
    expect(result.inside!.pm25).toBe(25);
    expect(result.score).toBe(58);
    expect(result.breaths).toBe(2);
    expect(result.schoolSeconds).toBe(10);
    expect(result.distanceMeters).toBe(300);
  });
  it('has finite empty and app-only summaries without helmet claims', () => {
    expect(summarize(emptyExposure())).toMatchObject({
      score: null,
      breaths: null,
      cleaner: null,
      inside: null,
    });
    const exposure = integrateExposure(emptyExposure(), {
      seconds: 20,
      outside: 50,
      inside: null,
      fanPct: 0,
      school: false,
      distanceMeters: 10,
    });
    const result = summarize(exposure);
    expect(result.outside.pm25).toBe(50);
    expect(result.inside).toBeNull();
    expect(result.breaths).toBeNull();
    expect(
      integrateExposure(exposure, {
        seconds: 0,
        outside: 0,
        inside: 0,
        fanPct: 70,
        school: true,
        distanceMeters: 100,
      }),
    ).toBe(exposure);
  });
  it('ranks average concentration and retains integrated exposure separately', () => {
    const result = scoreRoutes(BUNDLED_ROUTES, new Date(2026, 9, 16, 15), DEFAULT_FIELD);
    const selected = result.routes.find((route) => route.id === result.selectedId)!;
    const fastest = Math.min(...result.routes.map((route) => route.durationSec));
    expect(selected.durationSec).toBeLessThanOrEqual(fastest + 300);
    for (const route of result.routes)
      expect(route.integratedExposure).toBeCloseTo(route.averagePm25 * route.durationSec);
    const tooSlow = BUNDLED_ROUTES.map((route, index) => ({
      ...route,
      durationSec: index === 1 ? 6000 : route.durationSec,
    }));
    expect(scoreRoutes(tooSlow, new Date(2026, 9, 16, 15), DEFAULT_FIELD).selectedId).not.toBe(
      tooSlow[1].id,
    );
  });
});
