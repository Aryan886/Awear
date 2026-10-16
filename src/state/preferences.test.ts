import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, parsePreferences } from './preferences';
import { messages, resources } from '../i18n';
import { MULTILINGUAL_ENABLED } from '../config';
describe('local preferences', () => {
  it('uses defaults for a fresh install and round-trips all preferences', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    const preferences = {
      ...DEFAULT_PREFERENCES,
      language: 'en',
      sensitive: 'asthma',
      onboarding: true,
      helmet: false,
    };
    expect(parsePreferences(JSON.stringify(preferences))).toEqual(preferences);
  });
  for (const language of ['hi', 'mr']) {
    it(`loads saved ${language} preferences in the enabled build language`, () => {
      const preferences = {
        ...DEFAULT_PREFERENCES,
        language,
        onboarding: true,
        helmet: false,
        sensitive: 'asthma',
      };
      expect(parsePreferences(JSON.stringify(preferences))).toEqual({
        ...preferences,
        language: MULTILINGUAL_ENABLED ? language : 'en',
      });
    });
  }
  it('rejects corrupted, old and invalid preferences with context', () => {
    expect(() => parsePreferences('{bad')).toThrow('JSON');
    expect(() => parsePreferences('null')).toThrow('object');
    expect(() => parsePreferences(JSON.stringify({ ...DEFAULT_PREFERENCES, version: 2 }))).toThrow(
      'version',
    );
    expect(() =>
      parsePreferences(JSON.stringify({ ...DEFAULT_PREFERENCES, alwaysDuty: '70' })),
    ).toThrow('fields');
  });
  it('has identical, complete English, Hindi and Marathi key sets', () => {
    const englishKeys = Object.keys(resources.en.translation).sort();
    expect(englishKeys.length).toBeGreaterThan(200);
    expect(Object.keys(resources.hi.translation).sort()).toEqual(englishKeys);
    expect(Object.keys(resources.mr.translation).sort()).toEqual(englishKeys);
    for (const translations of Object.values(messages)) {
      expect(translations).toHaveLength(3);
      expect(translations.every((value) => value.trim().length > 0)).toBe(true);
    }
  });
});
