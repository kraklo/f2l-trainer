// App settings in localStorage. Solves live in IndexedDB (record/store.ts).

import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings } from './solve/analyse';

export interface Settings {
  analysis: AnalysisSettings;
  /** Show the 3D cube while solving (it can be distracting). */
  liveCube: boolean;
}

const KEY = 'f2l-trainer:settings';

export const DEFAULT_SETTINGS: Settings = { analysis: DEFAULT_ANALYSIS_SETTINGS, liveCube: true };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, analysis: { ...DEFAULT_ANALYSIS_SETTINGS, ...saved.analysis } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or blocked: settings just won't persist
  }
}
