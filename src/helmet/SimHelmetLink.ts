import type { Connection, HelmetLink } from './HelmetLink';
import {
  encodeTelemetry,
  Flags,
  HelmetState,
  Opcode,
  parseCommand,
  type Telemetry,
} from './protocol';

export class SimHelmetLink implements HelmetLink {
  readonly name = 'AWEAR-3A7C';
  connection: Connection = 'disconnected';
  locateCount = 0;
  lastCommand: Opcode | null = null;
  private readonly packets = new Set<(bytes: Uint8Array) => void>();
  private readonly connections = new Set<(connection: Connection, intentional: boolean) => void>();
  private nowMs: number;
  private readonly bootMs: number;
  private connectMs = Infinity;
  private testMs = Infinity;
  private lastPacketMs: number;
  private failsafeMs = 0;
  private insideRawValue = 520;
  private startDuty = 70;
  private packet: Telemetry = {
    version: 1,
    state: HelmetState.Boot,
    fanPct: 0,
    flags: 0,
    insideRaw: 520,
    outsideRaw: 980,
    insideBase: 520,
    outsideBase: 980,
    uptimeSec: 0,
    testProgress: 0,
    fanTarget: 0,
    seq: 0,
    buttonCount: 0,
    failsafeSec: 0,
  };

  constructor(nowMs: number) {
    this.nowMs = nowMs;
    this.bootMs = nowMs;
    this.lastPacketMs = nowMs;
  }

  connect(nowMs: number) {
    if (this.connection !== 'disconnected') return;
    this.nowMs = nowMs;
    this.connectMs = Math.max(nowMs + 1000, this.bootMs + 1200);
    this.setConnection('connecting', false);
  }

  disconnect(intentional = true) {
    this.connectMs = Infinity;
    if (this.packet.state === HelmetState.Connected) this.packet.state = HelmetState.Waiting;
    this.setConnection('disconnected', intentional);
    this.applyFan();
  }

  onPacket(listener: (bytes: Uint8Array) => void) {
    this.packets.add(listener);
    return () => {
      this.packets.delete(listener);
    };
  }
  onConnection(listener: (connection: Connection, intentional: boolean) => void) {
    this.connections.add(listener);
    return () => {
      this.connections.delete(listener);
    };
  }
  getTelemetry(): Telemetry {
    return { ...this.packet };
  }

  async write(bytes: Uint8Array) {
    const { opcode, value } = parseCommand(bytes);
    if (this.connection !== 'connected')
      throw new Error(`Cannot send opcode ${opcode}: simulator is ${this.connection}`);
    this.lastCommand = opcode;
    switch (opcode) {
      case Opcode.Arm:
        if (this.packet.state === HelmetState.Connected) this.startTest(false, false, value || 70);
        break;
      case Opcode.Disarm:
        this.disarm();
        break;
      case Opcode.SetFan:
        if (this.packet.state !== HelmetState.Running)
          throw new Error('SET_FAN requires a running helmet');
        this.packet.fanTarget = value === 0 ? 0 : Math.max(35, value!);
        this.applyFan();
        break;
      case Opcode.SelfTest:
        if (this.packet.state === HelmetState.Connected) this.startTest(true, false, 0);
        break;
      case Opcode.Locate:
        this.locateCount += 1;
        break;
      case Opcode.Calibrate:
        this.packet.insideBase = this.packet.insideRaw;
        this.packet.outsideBase = this.packet.outsideRaw;
        break;
      case Opcode.Keepalive:
        break;
    }
  }

  pressButton() {
    this.packet.buttonCount = (this.packet.buttonCount + 1) % 256;
    if (
      this.packet.state === HelmetState.Running ||
      this.packet.state === HelmetState.Testing ||
      this.packet.state === HelmetState.Arming
    ) {
      this.disarm();
    } else if (
      this.packet.state === HelmetState.Connected ||
      this.packet.state === HelmetState.Waiting
    ) {
      this.startTest(false, true, 70);
    }
  }

  setSensors(inside: boolean, outside: boolean) {
    this.packet.flags =
      (this.packet.flags & ~3) |
      (inside ? Flags.insideSensor : 0) |
      (outside ? Flags.outsideSensor : 0);
  }

  tick(nowMs: number) {
    const previousMs = this.nowMs;
    const elapsedMs = Math.max(0, nowMs - this.nowMs);
    const protectedUntilMs =
      this.connection === 'connected' ? previousMs : Math.min(nowMs, this.connectMs);
    const runningSinceMs =
      this.packet.state === HelmetState.Running ? previousMs : this.testMs + 6200;
    this.nowMs = nowMs;
    this.packet.uptimeSec = Math.floor((nowMs - this.bootMs) / 1000) % 65536;
    if (this.packet.state === HelmetState.Boot && nowMs - this.bootMs >= 1200)
      this.packet.state = HelmetState.Waiting;
    if (nowMs >= this.connectMs) {
      this.connectMs = Infinity;
      if (this.packet.state === HelmetState.Waiting) this.packet.state = HelmetState.Connected;
      this.setConnection('connected', false);
    }
    if (this.packet.state === HelmetState.Testing) {
      const testingMs = nowMs - this.testMs;
      this.packet.testProgress = Math.min(100, Math.floor(testingMs / 47));
      const fanTest = testingMs >= 1500 && testingMs < 3500;
      this.packet.flags = fanTest
        ? this.packet.flags | Flags.fanTest
        : this.packet.flags & ~Flags.fanTest;
      this.packet.fanPct = fanTest ? 70 : 0;
      if (testingMs >= 4700) {
        this.packet.flags = (this.packet.flags | Flags.passed) & ~Flags.fanTest;
        this.packet.fanPct = 0;
        if (this.packet.flags & Flags.testOnly) {
          this.packet.state =
            this.connection === 'connected' ? HelmetState.Connected : HelmetState.Waiting;
        } else this.packet.state = HelmetState.Arming;
      }
    }
    if (this.packet.state === HelmetState.Arming && nowMs - this.testMs >= 6200) {
      this.packet.state = HelmetState.Running;
      this.packet.fanTarget = this.startDuty;
    }
    this.applyFan();
    if (this.packet.state === HelmetState.Running)
      this.failsafeMs += Math.max(0, protectedUntilMs - Math.max(previousMs, runningSinceMs));
    this.packet.failsafeSec = Math.floor(this.failsafeMs / 1000) % 65536;
    const seconds = (nowMs - this.bootMs) / 1000;
    const traffic = seconds % 83 > 62 && seconds % 83 < 74 ? 130 : 0;
    this.packet.outsideRaw = Math.round(980 + 70 * Math.sin(seconds / 17) + traffic);
    const target = 520 + (this.packet.outsideRaw - 520) * (this.packet.fanPct > 0 ? 0.25 : 0.9);
    this.insideRawValue +=
      (target - this.insideRawValue) *
      (1 - Math.exp(-elapsedMs / (this.packet.fanPct ? 8000 : 20000)));
    this.packet.insideRaw = Math.round(this.insideRawValue);
    if (nowMs - this.lastPacketMs >= 500) {
      const packetCount = Math.floor((nowMs - this.lastPacketMs) / 500);
      this.lastPacketMs += packetCount * 500;
      this.packet.seq = (this.packet.seq + packetCount) % 256;
      if (this.connection === 'connected') {
        const bytes = encodeTelemetry(this.packet);
        for (const listener of this.packets) listener(bytes);
      }
    }
  }

  private setConnection(connection: Connection, intentional: boolean) {
    this.connection = connection;
    for (const listener of this.connections) listener(connection, intentional);
  }
  private startTest(testOnly: boolean, button: boolean, duty: number) {
    this.testMs = this.nowMs;
    this.startDuty = duty === 0 ? 0 : Math.max(35, duty);
    this.packet.state = HelmetState.Testing;
    this.packet.testProgress = 0;
    this.packet.flags =
      (this.packet.flags & 3) | (testOnly ? Flags.testOnly : 0) | (button ? Flags.button : 0);
  }
  private disarm() {
    this.packet.state =
      this.connection === 'connected' ? HelmetState.Connected : HelmetState.Waiting;
    this.packet.fanTarget = 0;
    this.packet.fanPct = 0;
    this.packet.testProgress = 0;
    this.packet.flags &= 3;
  }
  private applyFan() {
    if (this.packet.state === HelmetState.Running)
      this.packet.fanPct =
        this.connection === 'connected'
          ? this.packet.fanTarget
          : Math.max(70, this.packet.fanTarget);
  }
}
