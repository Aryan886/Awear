import { describe, expect, it } from 'vitest';
import { decideFan, type FanInput } from './fan';
const input: FanInput = {
  mode: 'smart',
  alwaysDuty: 70,
  pm25: 40,
  currentBand: 1,
  predictedBand: null,
  sensitive: false,
  spikeActive: false,
  nowMs: 0,
  eco: { isOn: false, startedMs: 0 },
};
describe('fan policy', () => {
  it('retains Eco hysteresis and the 120-second minimum', () => {
    const on = decideFan({ ...input, mode: 'eco', pm25: 60 });
    expect(on.duty).toBe(70);
    expect(decideFan({ ...input, mode: 'eco', pm25: 20, nowMs: 119999, eco: on.eco }).duty).toBe(
      70,
    );
    expect(decideFan({ ...input, mode: 'eco', pm25: 45, nowMs: 130000, eco: on.eco }).duty).toBe(
      70,
    );
    expect(decideFan({ ...input, mode: 'eco', pm25: 44, nowMs: 120000, eco: on.eco }).duty).toBe(0);
  });
  it('uses sensitive thresholds of 45 / 35', () => {
    const on = decideFan({ ...input, mode: 'eco', sensitive: true, pm25: 45 });
    expect(on.duty).toBe(70);
    expect(
      decideFan({ ...input, mode: 'eco', sensitive: true, pm25: 34, nowMs: 120000, eco: on.eco })
        .duty,
    ).toBe(0);
  });
  it('does not force High for Good air at a school', () => {
    expect(decideFan({ ...input, predictedBand: 1 }).duty).toBe(0);
  });
  it('applies look-ahead as a minimum over Eco', () => {
    expect(decideFan({ ...input, predictedBand: 2 }).duty).toBe(40);
    expect(decideFan({ ...input, pm25: 65, currentBand: 2, predictedBand: 2 }).duty).toBe(70);
    expect(decideFan({ ...input, predictedBand: 4 })).toMatchObject({
      duty: 100,
      reason: 'upcoming',
    });
  });
  it('keeps Off and Always authoritative during a spike', () => {
    expect(decideFan({ ...input, mode: 'off', spikeActive: true, predictedBand: 5 }).duty).toBe(0);
    expect(decideFan({ ...input, mode: 'always', alwaysDuty: 40, spikeActive: true }).duty).toBe(
      40,
    );
    expect(decideFan({ ...input, mode: 'eco', spikeActive: true }).duty).toBe(100);
    expect(decideFan({ ...input, mode: 'eco', currentBand: 4 }).duty).toBe(100);
  });
  it('releases the spike override when activity expires', () => {
    expect(decideFan({ ...input, spikeActive: true }).reason).toBe('spike');
    expect(decideFan(input).duty).toBe(0);
  });
});
