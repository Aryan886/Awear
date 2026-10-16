import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, useAppStore } from './appStore';
import { DEFAULT_PREFERENCES } from './preferences';
import { HelmetState } from '../helmet/protocol';
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));

let clockMs = 0;
let cleanup = () => {};
async function advance(milliseconds: number) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
    clockMs += 100;
    vi.advanceTimersByTime(100);
    await Promise.resolve();
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  clockMs = new Date(2026, 9, 16, 15).getTime();
  actions.setClockForTest(() => clockMs);
  actions.setPreferences({ ...DEFAULT_PREFERENCES });
  actions.setForeground(true);
  cleanup = actions.startRuntime();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('coherent session lifecycle', () => {
  it('does not send fan commands while Stop awaits the next telemetry packet', async () => {
    actions.connect();
    await advance(1500);
    await actions.arm();
    await advance(7000);
    expect(actions.startRide()).toBe(true);
    await advance(2000);
    const diagnostics = useAppStore.getState().diagnostics;
    await actions.stopRide();
    await advance(400);
    expect(actions.debug().telemetry.fanPct).toBe(0);
    expect(useAppStore.getState().diagnostics).toEqual(diagnostics);
    expect(useAppStore.getState().ride).toBeNull();
  });
  it('does not send a new fan demand immediately after a direct disarm', async () => {
    actions.connect();
    await advance(1500);
    await actions.arm();
    await advance(7000);
    actions.setPreferences({ fanMode: 'off' });
    const diagnostics = useAppStore.getState().diagnostics;
    await actions.disarm();
    await advance(400);
    expect(actions.debug().telemetry.fanPct).toBe(0);
    expect(useAppStore.getState().diagnostics).toEqual(diagnostics);
  });
  it('starts the Eco minimum run at confirmed airflow rather than unarmed waiting', async () => {
    actions.setPreferences({ fanMode: 'eco' });
    actions.connect();
    await advance(130000);
    await actions.arm();
    await advance(7000);
    actions.clearAir();
    await advance(3000);
    expect(useAppStore.getState().snapshot.fan.duty).toBe(70);
    await advance(121000);
    expect(useAppStore.getState().snapshot.fan.duty).toBe(0);
  });
  it('restores fan control when a disconnect cancels a queued disarm', async () => {
    actions.connect();
    await advance(1500);
    await actions.arm();
    await advance(7000);
    const disarm = actions.disarm();
    actions.disconnect();
    await disarm;
    actions.setPreferences({ fanMode: 'off' });
    await advance(2000);
    actions.connect();
    await advance(2000);
    expect(useAppStore.getState().connection).toBe('connected');
    expect(actions.debug().telemetry.state).toBe(HelmetState.Running);
    expect(actions.debug().telemetry.fanPct).toBe(0);
  });
  it('disarms before switching an armed helmet to app-only mode', async () => {
    actions.connect();
    await advance(1500);
    await actions.arm();
    await advance(6500);
    await actions.setHelmetMode(false);
    expect(actions.debug().telemetry.fanPct).toBe(0);
    expect(useAppStore.getState().preferences.helmet).toBe(false);
    expect(useAppStore.getState().connection).toBe('disconnected');
  });
  it('does not invent inactive exposure and requires deliberate resume', async () => {
    actions.setPreferences({ helmet: false });
    expect(actions.startRide()).toBe(true);
    await advance(2000);
    const before = useAppStore.getState().ride!.exposure.seconds;
    actions.setForeground(false);
    await advance(10000);
    actions.setForeground(true);
    await advance(2000);
    expect(useAppStore.getState().ride!.paused).toBe(true);
    expect(useAppStore.getState().ride!.exposure.seconds).toBe(before);
    actions.resumeRide();
    await advance(1000);
    expect(useAppStore.getState().ride!.exposure.seconds).toBeCloseTo(before + 1, 1);
    await actions.stopRide();
    expect(useAppStore.getState().summary!.score).toBeNull();
    const summary = useAppStore.getState().summary;
    await actions.stopRide();
    expect(useAppStore.getState().summary).toBe(summary);
  });
  it('suppresses intentional reconnect, reports counter delta and retries unexpected loss', async () => {
    actions.connect();
    await advance(1500);
    await actions.arm();
    await advance(6500);
    expect(useAppStore.getState().telemetry!.state).toBe(HelmetState.Running);
    const previousPacketCount = useAppStore.getState().packetCount;
    actions.disconnect();
    await advance(5000);
    expect(useAppStore.getState().connection).toBe('disconnected');
    actions.connect();
    await advance(1500);
    expect(useAppStore.getState().connection).toBe('connected');
    expect(useAppStore.getState().packetCount).toBeLessThan(previousPacketCount);
    expect(useAppStore.getState().toast).toMatchObject({ key: 'protectedSeconds' });
    expect(Number(useAppStore.getState().toast!.values!.seconds)).toBeGreaterThan(0);
    actions.disconnect(false);
    await advance(4500);
    expect(useAppStore.getState().connection).toBe('connected');
  });
  it('replays reset at an injected fixed clock with route and control state restored', async () => {
    const initial = useAppStore.getState().snapshot;
    actions.setScenario('highway');
    actions.spike();
    actions.setSpeed(10);
    actions.reset();
    expect(useAppStore.getState().snapshot).toEqual(initial);
    expect(useAppStore.getState()).toMatchObject({
      speed: 4,
      scenario: 'busy',
      ride: null,
      destination: 'swargate',
    });
  });
});
