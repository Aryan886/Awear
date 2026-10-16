import type { FanMode } from '../model/fan';
import { MULTILINGUAL_ENABLED } from '../config';
export type Language = 'en' | 'hi' | 'mr';
export function getEnabledLanguage(language: Language): Language {
  return MULTILINGUAL_ENABLED ? language : 'en';
}
export type Sensitive = 'none' | 'asthma' | 'children' | 'elderly';
export interface Preferences {
  version: 1;
  language: Language;
  onboarding: boolean;
  helmet: boolean;
  sensitive: Sensitive;
  details: boolean;
  fanMode: FanMode;
  alwaysDuty: 40 | 70 | 100;
}
export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  language: 'en',
  onboarding: false,
  helmet: true,
  sensitive: 'none',
  details: false,
  fanMode: 'smart',
  alwaysDuty: 70,
};
export function parsePreferences(text: string | null): Preferences {
  if (!text) return { ...DEFAULT_PREFERENCES };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Preferences are not valid JSON: ${String(error)}`);
  }
  if (typeof value !== 'object' || value === null) throw new Error('Preferences must be an object');
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !['en', 'hi', 'mr'].includes(String(record.language)) ||
    !['none', 'asthma', 'children', 'elderly'].includes(String(record.sensitive)) ||
    !['off', 'eco', 'smart', 'always'].includes(String(record.fanMode)) ||
    ![40, 70, 100].includes(Number(record.alwaysDuty)) ||
    typeof record.alwaysDuty !== 'number' ||
    typeof record.onboarding !== 'boolean' ||
    typeof record.helmet !== 'boolean' ||
    typeof record.details !== 'boolean'
  ) {
    throw new Error('Preferences have an unsupported version or invalid fields; using defaults');
  }
  return {
    version: 1,
    language: getEnabledLanguage(record.language as Language),
    onboarding: record.onboarding,
    helmet: record.helmet,
    sensitive: record.sensitive as Sensitive,
    details: record.details,
    fanMode: record.fanMode as FanMode,
    alwaysDuty: record.alwaysDuty as 40 | 70 | 100,
  };
}
