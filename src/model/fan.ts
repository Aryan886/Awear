import type { Band } from './air';
export type FanMode = 'off' | 'eco' | 'smart' | 'always';
export type FanDuty = 0 | 40 | 70 | 100;
export type FanReason = 'off' | 'always' | 'eco' | 'current' | 'upcoming' | 'spike';
export interface EcoState {
  isOn: boolean;
  startedMs: number;
}
export interface FanInput {
  mode: FanMode;
  alwaysDuty: 40 | 70 | 100;
  pm25: number;
  currentBand: Band;
  predictedBand: Band | null;
  sensitive: boolean;
  spikeActive: boolean;
  nowMs: number;
  eco: EcoState;
}
export interface FanDecision {
  duty: FanDuty;
  reason: FanReason;
  eco: EcoState;
}

export function decideFan(input: FanInput): FanDecision {
  let eco = { ...input.eco };
  const turnOn = input.sensitive ? 45 : 60;
  const turnOff = input.sensitive ? 35 : 45;
  if (!eco.isOn && input.pm25 >= turnOn) eco = { isOn: true, startedMs: input.nowMs };
  else if (eco.isOn && input.pm25 < turnOff && input.nowMs - eco.startedMs >= 120000)
    eco.isOn = false;
  if (input.mode === 'off') return { duty: 0, reason: 'off', eco };
  if (input.mode === 'always') return { duty: input.alwaysDuty, reason: 'always', eco };
  if (input.spikeActive) return { duty: 100, reason: 'spike', eco };
  let duty: FanDuty = eco.isOn ? 70 : 0;
  let reason: FanReason = 'eco';
  if (input.currentBand >= 4) {
    duty = 100;
    reason = 'current';
  }
  if (input.mode === 'smart') {
    const demand = (band: Band): FanDuty =>
      band >= 4 ? 100 : band === 3 ? 70 : band === 2 ? 40 : 0;
    const currentDuty = demand(input.currentBand);
    if (currentDuty > duty) {
      duty = currentDuty;
      reason = 'current';
    }
    if (input.predictedBand !== null && demand(input.predictedBand) > duty) {
      duty = demand(input.predictedBand);
      reason = 'upcoming';
    }
  }
  return { duty, reason, eco };
}
