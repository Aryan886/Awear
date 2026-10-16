import { describe, expect, it } from 'vitest';
import {
  counterDelta,
  encodeCommand,
  encodeTelemetry,
  getFailsafeDelta,
  HelmetState,
  Opcode,
  parseCommand,
  parseTelemetry,
  type Telemetry,
} from './protocol';
import { SimHelmetLink } from './SimHelmetLink';
import { CommandQueue } from './HelmetLink';

const packet: Telemetry = {
  version: 1,
  state: HelmetState.Running,
  fanPct: 100,
  flags: 63,
  insideRaw: 0,
  outsideRaw: 4095,
  insideBase: 0,
  outsideBase: 4095,
  uptimeSec: 65535,
  testProgress: 100,
  fanTarget: 100,
  seq: 255,
  buttonCount: 255,
  failsafeSec: 65535,
};
describe('firmware packet contract', () => {
  it('round-trips boundary integers and little endian offsets', () => {
    const encoded = encodeTelemetry(packet);
    expect(encoded).toHaveLength(20);
    expect(encoded[6]).toBe(255);
    expect(encoded[7]).toBe(15);
    expect(parseTelemetry(encoded)).toEqual(packet);
    const padded = new Uint8Array(30);
    padded.set(encoded, 4);
    expect(parseTelemetry(padded.subarray(4, 24))).toEqual(packet);
  });
  it('rejects malformed packets and unsupported versions', () => {
    expect(() => parseTelemetry(new Uint8Array(19))).toThrow('20 bytes');
    const bytes = encodeTelemetry(packet);
    bytes[0] = 2;
    expect(() => parseTelemetry(bytes)).toThrow('version');
    bytes[0] = 1;
    bytes[2] = 101;
    expect(() => parseTelemetry(bytes)).toThrow('fanPct');
    expect(() => encodeTelemetry({ ...packet, insideRaw: -1 })).toThrow();
  });
  it('validates opcode arguments and lengths', () => {
    expect(parseCommand(encodeCommand(Opcode.Arm))).toEqual({ opcode: Opcode.Arm, value: 0 });
    expect(() => encodeCommand(Opcode.SetFan, 101)).toThrow();
    expect(() => parseCommand(new Uint8Array([2, 3]))).toThrow();
    expect(() => parseCommand(new Uint8Array([3]))).toThrow();
    expect(() => parseCommand(new Uint8Array([8]))).toThrow();
    expect(() => parseCommand(new Uint8Array([1, 10, 20]))).toThrow();
  });
  it('handles counter wraps and never calls a reset protected time', () => {
    expect(counterDelta(255, 0, 8)).toBe(1);
    expect(counterDelta(65535, 2, 16)).toBe(3);
    expect(
      getFailsafeDelta(
        { ...packet, uptimeSec: 65530, failsafeSec: 65530 },
        { ...packet, uptimeSec: 8, failsafeSec: 5 },
      ),
    ).toBe(11);
    expect(
      getFailsafeDelta(
        { ...packet, uptimeSec: 100, failsafeSec: 42 },
        { ...packet, uptimeSec: 2, failsafeSec: 0 },
      ),
    ).toBe(0);
    expect(getFailsafeDelta(packet, packet)).toBe(0);
  });
});

function connectedSimulator() {
  const sim = new SimHelmetLink(0);
  sim.connect(0);
  sim.tick(1200);
  return sim;
}
function advance(sim: SimHelmetLink, start: number, end: number) {
  for (let now = start + 100; now <= end; now += 100) sim.tick(now);
}
describe('simulated module', () => {
  it('boots, connects, tests the fan and arms on firmware timing', async () => {
    const sim = connectedSimulator();
    await sim.write(encodeCommand(Opcode.Arm));
    sim.tick(2700);
    expect(sim.getTelemetry().fanPct).toBe(70);
    sim.tick(5900);
    expect(sim.getTelemetry().state).toBe(HelmetState.Arming);
    sim.tick(7400);
    expect(sim.getTelemetry().state).toBe(HelmetState.Running);
    await sim.write(encodeCommand(Opcode.SetFan, 1));
    expect(sim.getTelemetry().fanPct).toBe(35);
  });
  it('test-only never arms, and duplicate ARM does not restart a test', async () => {
    const sim = connectedSimulator();
    await sim.write(encodeCommand(Opcode.SelfTest));
    sim.tick(5900);
    expect(sim.getTelemetry().state).toBe(HelmetState.Connected);
    expect(sim.getTelemetry().fanPct).toBe(0);
    await sim.write(encodeCommand(Opcode.Arm));
    sim.tick(6000);
    await sim.write(encodeCommand(Opcode.Arm));
    sim.tick(12100);
    expect(sim.getTelemetry().state).toBe(HelmetState.Running);
  });
  it('uses the default ARM duty for zero and clamps nonzero starting duty to 35%', async () => {
    for (const [duty, expectedDuty] of [
      [0, 70],
      [1, 35],
      [34, 35],
      [35, 35],
      [100, 100],
    ]) {
      const sim = connectedSimulator();
      await sim.write(encodeCommand(Opcode.Arm, duty));
      sim.tick(7400);
      expect(sim.getTelemetry().state).toBe(HelmetState.Running);
      expect(sim.getTelemetry().fanTarget).toBe(expectedDuty);
      expect(sim.getTelemetry().fanPct).toBe(expectedDuty);
    }
  });
  it('continues self-check while disconnected and protects at least 70%', async () => {
    const sim = connectedSimulator();
    await sim.write(encodeCommand(Opcode.Arm, 40));
    sim.disconnect();
    advance(sim, 1200, 12400);
    expect(sim.getTelemetry().state).toBe(HelmetState.Running);
    expect(sim.getTelemetry().fanPct).toBeGreaterThanOrEqual(70);
    expect(sim.getTelemetry().failsafeSec).toBeGreaterThanOrEqual(5);
    sim.connect(12400);
    sim.tick(13400);
    expect(sim.getTelemetry().state).toBe(HelmetState.Running);
  });
  it('button toggles arm and disarm, calibrate/locate/keepalive are observable', async () => {
    const sim = connectedSimulator();
    sim.pressButton();
    sim.tick(7400);
    expect(sim.getTelemetry().buttonCount).toBe(1);
    expect(sim.getTelemetry().state).toBe(HelmetState.Running);
    sim.pressButton();
    expect(sim.getTelemetry().fanPct).toBe(0);
    await sim.write(encodeCommand(Opcode.Locate));
    expect(sim.locateCount).toBe(1);
    await sim.write(encodeCommand(Opcode.Calibrate));
    expect(sim.getTelemetry().outsideBase).toBe(sim.getTelemetry().outsideRaw);
    await sim.write(encodeCommand(Opcode.Keepalive));
    expect(sim.lastCommand).toBe(Opcode.Keepalive);
    sim.setSensors(true, false);
    expect(sim.getTelemetry().flags & 3).toBe(1);
  });
  it('counts only running disconnected time across a delayed tick and reconnect boundary', async () => {
    const sim = connectedSimulator();
    await sim.write(encodeCommand(Opcode.Arm));
    sim.disconnect();
    sim.tick(8400);
    expect(sim.getTelemetry().failsafeSec).toBe(1);
    sim.connect(8400);
    sim.tick(9400);
    expect(sim.getTelemetry().failsafeSec).toBe(2);
  });
  it('serializes writes and recovers after a rejected command', async () => {
    const sim = connectedSimulator();
    const queue = new CommandQueue(sim);
    await expect(queue.send(new Uint8Array([0]))).rejects.toThrow();
    await queue.send(encodeCommand(Opcode.Locate));
    expect(sim.locateCount).toBe(1);
  });
});
