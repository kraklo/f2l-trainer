// Full analysis of a recorded solve. Runs in the analysis worker; pure, so tests call it directly.

import { reconstruct, type Reconstruction } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { analyseCross, DEFAULT_CROSS_OPTIONS, type CrossAnalysis, type CrossOptions } from './analyse-cross';
import { analyseF2L, DEFAULT_F2L_OPTIONS, type DecisionPoint, type F2LOptions } from './analyse-f2l';
import { type Tables } from './tables';

export interface Analysis {
  recon: Reconstruction;
  cross: CrossAnalysis;
  f2l: DecisionPoint[];
  ms: number;
}

export function analyse(t: Tables, record: SolveRecord, cross: CrossOptions = DEFAULT_CROSS_OPTIONS, f2l: F2LOptions = DEFAULT_F2L_OPTIONS): Analysis | null {
  const start = performance.now();
  const recon = reconstruct(record);
  if (!recon) return null;
  return { recon, cross: analyseCross(t, record, recon, cross), f2l: analyseF2L(t, record, recon, f2l), ms: performance.now() - start };
}
