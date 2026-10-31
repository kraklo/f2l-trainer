// Full analysis of a recorded solve. Runs in the analysis worker; pure, so tests call it directly.

import { DEFAULT_NORMALISE, reconstruct, type Reconstruction } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { analyseCross, DEFAULT_CROSS_OPTIONS, type CrossAnalysis } from './analyse-cross';
import { analyseF2L, DEFAULT_F2L_OPTIONS, type DecisionPoint } from './analyse-f2l';
import { DEFAULT_WEIGHTS } from './cost';
import { type Tables } from './tables';

export interface Analysis {
  recon: Reconstruction;
  cross: CrossAnalysis;
  f2l: DecisionPoint[];
  ms: number;
}

/** The user-facing knobs of the analysis (see the Settings screen). */
export interface AnalysisSettings {
  /** Cross colours the solver is comfortable with (core face ids). */
  allowedColours: number[];
  /** Slice and wide moves the solver uses (merged from turn + rotation). */
  wides: string;
  pauseThresholdMs: number;
  frontPenalty: number;
  sideSwitch: number;
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  allowedColours: DEFAULT_CROSS_OPTIONS.allowedColours,
  wides: DEFAULT_NORMALISE.merge.wides,
  pauseThresholdMs: DEFAULT_NORMALISE.pauseThresholdMs,
  frontPenalty: DEFAULT_F2L_OPTIONS.search.frontPenalty,
  sideSwitch: DEFAULT_WEIGHTS.sideSwitch,
};

export function analyse(t: Tables, record: SolveRecord, s: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS): Analysis | null {
  const start = performance.now();
  const recon = reconstruct(record, {
    ...DEFAULT_NORMALISE,
    merge: { ...DEFAULT_NORMALISE.merge, wides: s.wides },
    pauseThresholdMs: s.pauseThresholdMs,
  });
  if (!recon) return null;
  const weights = { ...DEFAULT_WEIGHTS, sideSwitch: s.sideSwitch };
  const cross = analyseCross(t, record, recon, { ...DEFAULT_CROSS_OPTIONS, allowedColours: s.allowedColours, weights });
  const f2l = analyseF2L(t, record, recon, { ...DEFAULT_F2L_OPTIONS, search: { ...DEFAULT_F2L_OPTIONS.search, weights, frontPenalty: s.frontPenalty } });
  return { recon, cross, f2l, ms: performance.now() - start };
}
