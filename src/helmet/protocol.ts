export const SERVICE_UUID = 'a3c10000-5f2b-4b8e-9d3a-0e1f2a3b4c5d';
export const TELEMETRY_UUID = 'a3c10001-5f2b-4b8e-9d3a-0e1f2a3b4c5d';
export const COMMAND_UUID = 'a3c10002-5f2b-4b8e-9d3a-0e1f2a3b4c5d';
export const PACKET_BYTES = 20;

export enum HelmetState {
  Boot,
  Waiting,
  Connected,
  Testing,
  Arming,
  Running,
}
export const Flags = {
  insideSensor: 1,
  outsideSensor: 2,
  passed: 4,
  button: 8,
  fanTest: 16,
  testOnly: 32,
} as const;
export enum Opcode {
  Arm = 1,
  Disarm,
  SetFan,
  SelfTest,
  Locate,
  Calibrate,
  Keepalive,
}
export interface Telemetry {
  version: number;
  state: HelmetState;
  fanPct: number;
  flags: number;
  insideRaw: number;
  outsideRaw: number;
  insideBase: number;
  outsideBase: number;
  uptimeSec: number;
  testProgress: number;
  fanTarget: number;
  seq: number;
  buttonCount: number;
  failsafeSec: number;
}

function checkInteger(value: number, maximum: number, name: string) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new Error(`Telemetry ${name} must be an integer between 0 and ${maximum}; got ${value}`);
  }
}

export function parseTelemetry(input: DataView | Uint8Array): Telemetry {
  const view =
    input instanceof DataView
      ? input
      : new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.byteLength !== PACKET_BYTES)
    throw new Error(`Telemetry packet: expected 20 bytes, received ${view.byteLength}`);
  const packet: Telemetry = {
    version: view.getUint8(0),
    state: view.getUint8(1),
    fanPct: view.getUint8(2),
    flags: view.getUint8(3),
    insideRaw: view.getUint16(4, true),
    outsideRaw: view.getUint16(6, true),
    insideBase: view.getUint16(8, true),
    outsideBase: view.getUint16(10, true),
    uptimeSec: view.getUint16(12, true),
    testProgress: view.getUint8(14),
    fanTarget: view.getUint8(15),
    seq: view.getUint8(16),
    buttonCount: view.getUint8(17),
    failsafeSec: view.getUint16(18, true),
  };
  if (packet.version !== 1) throw new Error(`Unsupported telemetry version ${packet.version}`);
  checkInteger(packet.state, 5, 'state');
  checkInteger(packet.flags, 63, 'flags');
  for (const name of ['fanPct', 'fanTarget', 'testProgress'] as const)
    checkInteger(packet[name], 100, name);
  for (const name of ['insideRaw', 'outsideRaw', 'insideBase', 'outsideBase'] as const)
    checkInteger(packet[name], 4095, name);
  return packet;
}

export function encodeTelemetry(packet: Telemetry): Uint8Array {
  for (const name of [
    'version',
    'state',
    'fanPct',
    'flags',
    'testProgress',
    'fanTarget',
    'seq',
    'buttonCount',
  ] as const) {
    checkInteger(packet[name], 255, name);
  }
  for (const name of [
    'insideRaw',
    'outsideRaw',
    'insideBase',
    'outsideBase',
    'uptimeSec',
    'failsafeSec',
  ] as const) {
    checkInteger(packet[name], 65535, name);
  }
  const view = new DataView(new ArrayBuffer(PACKET_BYTES));
  view.setUint8(0, packet.version);
  view.setUint8(1, packet.state);
  view.setUint8(2, packet.fanPct);
  view.setUint8(3, packet.flags);
  view.setUint16(4, packet.insideRaw, true);
  view.setUint16(6, packet.outsideRaw, true);
  view.setUint16(8, packet.insideBase, true);
  view.setUint16(10, packet.outsideBase, true);
  view.setUint16(12, packet.uptimeSec, true);
  view.setUint8(14, packet.testProgress);
  view.setUint8(15, packet.fanTarget);
  view.setUint8(16, packet.seq);
  view.setUint8(17, packet.buttonCount);
  view.setUint16(18, packet.failsafeSec, true);
  const bytes = new Uint8Array(view.buffer);
  parseTelemetry(bytes);
  return bytes;
}

export function encodeCommand(opcode: Opcode, value?: number): Uint8Array {
  const needsValue = opcode === Opcode.Arm || opcode === Opcode.SetFan;
  if (!Number.isInteger(opcode) || opcode < 1 || opcode > 7)
    throw new Error(`Unknown helmet opcode ${opcode}`);
  if (needsValue) {
    checkInteger(value ?? (opcode === Opcode.Arm ? 0 : -1), 100, 'command fan duty');
    return new Uint8Array([opcode, value ?? 0]);
  }
  if (value !== undefined) throw new Error(`Opcode ${opcode} does not accept an argument`);
  return new Uint8Array([opcode]);
}

export function parseCommand(bytes: Uint8Array): { opcode: Opcode; value?: number } {
  const opcode = bytes[0] as Opcode;
  const expected = encodeCommand(opcode, bytes.length === 2 ? bytes[1] : undefined);
  if (bytes.length !== expected.length)
    throw new Error(`Opcode ${opcode}: invalid command length ${bytes.length}`);
  return { opcode, value: bytes[1] };
}

// A long gap or backwards uptime is ambiguous with a reboot. Never call it protection.
export function getFailsafeDelta(before: Telemetry, after: Telemetry): number {
  const elapsed = (after.uptimeSec - before.uptimeSec + 65536) % 65536;
  const protectedSeconds = (after.failsafeSec - before.failsafeSec + 65536) % 65536;
  if (elapsed > 32767 || protectedSeconds > elapsed) return 0;
  return protectedSeconds;
}

export function counterDelta(before: number, after: number, bits: 8 | 16): number {
  const modulus = 2 ** bits;
  return (after - before + modulus) % modulus;
}
