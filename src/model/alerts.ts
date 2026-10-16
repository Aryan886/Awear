import type { Band } from './air';
export type AlertType = 'ahead' | 'zone' | 'spike' | 'action' | 'improved';
export interface AirAlert {
  id: string;
  type: AlertType;
  timeMs: number;
  band: Band;
  zoneId: string | null;
}
export interface AlertMemory {
  cooldowns: Record<string, number>;
  zoneIds: string[];
  badSince: Record<string, number>;
  previousBand: Band;
}
export function emptyAlertMemory(band: Band = 3): AlertMemory {
  return { cooldowns: {}, zoneIds: [], badSince: {}, previousBand: band };
}
export interface AlertInput {
  nowMs: number;
  currentBand: Band;
  aheadBand: Band | null;
  aheadCell: string;
  sensitive: boolean;
  enteredZones: { id: string; band: Band }[];
  zoneBands: { id: string; band: Band }[];
  spikeDetected: boolean;
  rushZone: string | null;
}
export function collectAlerts(
  previous: AlertMemory,
  input: AlertInput,
): { memory: AlertMemory; alerts: AirAlert[] } {
  const memory: AlertMemory = {
    ...previous,
    cooldowns: { ...previous.cooldowns },
    badSince: { ...previous.badSince },
    zoneIds: input.enteredZones.map((zone) => zone.id),
  };
  const alerts: AirAlert[] = [];
  function add(
    type: AlertType,
    key: string,
    cooldown: number,
    band: Band,
    zoneId: string | null = null,
  ) {
    if (input.nowMs - (memory.cooldowns[key] ?? -Infinity) < cooldown) return;
    memory.cooldowns[key] = input.nowMs;
    alerts.push({ id: `${key}-${input.nowMs}`, type, timeMs: input.nowMs, band, zoneId });
  }
  if (input.aheadBand !== null && input.aheadBand >= (input.sensitive ? 2 : 3))
    add('ahead', `ahead-${input.aheadCell}`, 180000, input.aheadBand);
  for (const zone of input.enteredZones) {
    if (!previous.zoneIds.includes(zone.id) && zone.band >= (input.sensitive ? 1 : 2))
      add('zone', `zone-${zone.id}`, 0, zone.band, zone.id);
  }
  if (input.spikeDetected) add('spike', 'spike', 60000, input.currentBand);
  for (const zone of input.zoneBands) {
    if (zone.band >= (input.sensitive ? 2 : 3)) {
      memory.badSince[zone.id] ??= input.nowMs;
      if (input.nowMs - memory.badSince[zone.id] >= 60000 || input.rushZone === zone.id)
        add('action', `action-${zone.id}`, 600000, zone.band, zone.id);
    } else delete memory.badSince[zone.id];
  }
  if (previous.previousBand - input.currentBand >= 2)
    add('improved', 'improved', 120000, input.currentBand);
  // Retain the high-water band until the two-band improvement is observed.
  memory.previousBand =
    input.currentBand > previous.previousBand || alerts.some((alert) => alert.type === 'improved')
      ? input.currentBand
      : previous.previousBand;
  return { memory, alerts };
}
