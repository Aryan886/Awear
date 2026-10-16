import { describe, expect, it } from 'vitest';
import { collectAlerts, emptyAlertMemory, type AlertInput } from './alerts';
const input: AlertInput = {
  nowMs: 0,
  currentBand: 3,
  aheadBand: null,
  aheadCell: 'one',
  sensitive: false,
  enteredZones: [],
  zoneBands: [],
  spikeDetected: false,
  rushZone: null,
};
describe('alerts', () => {
  it('enters once, permits re-entry, and advances severity without moving zones', () => {
    const first = collectAlerts(emptyAlertMemory(), {
      ...input,
      enteredZones: [{ id: 'banyan', band: 2 }],
    });
    expect(first.alerts[0].type).toBe('zone');
    const again = collectAlerts(first.memory, {
      ...input,
      nowMs: 100,
      enteredZones: [{ id: 'banyan', band: 2 }],
    });
    expect(again.alerts).toHaveLength(0);
    const left = collectAlerts(again.memory, { ...input, nowMs: 200 });
    expect(
      collectAlerts(left.memory, {
        ...input,
        nowMs: 300,
        enteredZones: [{ id: 'banyan', band: 2 }],
      }).alerts,
    ).toHaveLength(1);
    expect(
      collectAlerts(emptyAlertMemory(), { ...input, sensitive: true, aheadBand: 2 }).alerts[0].type,
    ).toBe('ahead');
    expect(collectAlerts(emptyAlertMemory(), { ...input, sensitive: true }).alerts).toHaveLength(0);
  });
  it('debounces spikes 60s and route cells 3 min', () => {
    const first = collectAlerts(emptyAlertMemory(), {
      ...input,
      spikeDetected: true,
      aheadBand: 3,
    });
    expect(first.alerts).toHaveLength(2);
    expect(
      collectAlerts(first.memory, { ...input, nowMs: 59000, spikeDetected: true, aheadBand: 3 })
        .alerts,
    ).toHaveLength(0);
    const second = collectAlerts(first.memory, {
      ...input,
      nowMs: 60000,
      spikeDetected: true,
      aheadBand: 3,
    });
    expect(second.alerts.map((alert) => alert.type)).toEqual(['spike']);
  });
  it('requires 60s of bad zone air and enforces a ten-minute Action Card cooldown', () => {
    const zoneBands = [{ id: 'banyan', band: 3 as const }];
    const first = collectAlerts(emptyAlertMemory(), { ...input, zoneBands });
    expect(first.alerts).toHaveLength(0);
    const second = collectAlerts(first.memory, { ...input, zoneBands, nowMs: 60000 });
    expect(second.alerts[0].type).toBe('action');
    expect(
      collectAlerts(second.memory, { ...input, zoneBands, nowMs: 61000, rushZone: 'banyan' })
        .alerts,
    ).toHaveLength(0);
    expect(
      collectAlerts(emptyAlertMemory(), { ...input, zoneBands, rushZone: 'banyan' }).alerts[0].type,
    ).toBe('action');
  });
});
