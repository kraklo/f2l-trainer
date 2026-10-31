// Full analysis of a recorded solve. Runs in the analysis worker; pure, so tests call it directly.

import { reconstruct, type Reconstruction } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { analyseCross, DEFAULT_CROSS_OPTIONS, type CrossAnalysis, type CrossOptions } from './analyse-cross';
import { type Tables } from './tables';

export interface Analysis {
  recon: Reconstruction;
  cross: CrossAnalysis;
  ms: number;
}

export function analyse(t: Tables, record: SolveRecord, cross: CrossOptions = DEFAULT_CROSS_OPTIONS): Analysis | null {
  const start = performance.now();
  const recon = reconstruct(record);
  if (!recon) return null;
  return { recon, cross: analyseCross(t, record, recon, cross), ms: performance.now() - start };
}
