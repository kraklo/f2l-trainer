// Capture-quality checks for a recorded solve (the M0 acceptance criteria).

import { applyMoves, fromFaceletString, parseAlg, solvedFacelets, toFaceletString, type Move } from '../cube/cube';
import { type SolveRecord } from './types';

export interface CheckResult {
  name: string;
  /** 'sync' failures mean the recorded moves don't explain the cube's state (the solve is desynced). */
  kind: 'sync' | 'quality';
  ok: boolean;
  detail: string;
}

/** Max share of moves allowed without a cube timestamp (recovered moves are filled by the time fit). */
const MAX_NULL_CUBE_TS = 0.05;
// The GAN16 ui Maglev sends ~10 Hz in bursts; a rotation (~250 ms) still spans 1-2 samples.
const MIN_GYRO_HZ = 8;

function toMoves(rec: SolveRecord, which: 'inspectionMoves' | 'moves'): Move[] {
  return rec[which].map((m) => ({ base: m.face, amount: m.amount }));
}

export function checkRecord(rec: SolveRecord): CheckResult[] {
  const results: CheckResult[] = [];

  const scrambled = toFaceletString(applyMoves(solvedFacelets(), parseAlg(rec.scramble)));
  results.push({
    name: 'scramble matches start facelets',
    kind: 'sync',
    ok: scrambled === rec.startFacelets,
    detail: scrambled === rec.startFacelets ? '' : `expected ${scrambled}, cube reported ${rec.startFacelets}`,
  });

  const start = fromFaceletString(rec.startFacelets);
  const end = toFaceletString(applyMoves(applyMoves(start, toMoves(rec, 'inspectionMoves')), toMoves(rec, 'moves')));
  results.push({
    name: 'replay matches end facelets',
    kind: 'sync',
    ok: rec.endFacelets !== undefined && end === rec.endFacelets,
    detail: rec.endFacelets === undefined ? 'no end facelets recorded' : end === rec.endFacelets ? '' : `replay ${end}, cube reported ${rec.endFacelets}`,
  });

  const nulls = rec.moves.filter((m) => m.cubeTs === null).length;
  const share = rec.moves.length ? nulls / rec.moves.length : 1;
  results.push({
    name: 'cube timestamps present',
    kind: 'quality',
    ok: rec.moves.length > 0 && share <= MAX_NULL_CUBE_TS,
    detail: `${nulls}/${rec.moves.length} moves without cube time`,
  });

  const hz = gyroRate(rec);
  results.push({
    name: `gyro ≥ ${MIN_GYRO_HZ} Hz during solve`,
    kind: 'quality',
    ok: hz >= MIN_GYRO_HZ,
    detail: `${hz.toFixed(1)} Hz`,
  });

  return results;
}

export function isDesynced(results: CheckResult[]): boolean {
  return results.some((r) => r.kind === 'sync' && !r.ok);
}

/** Mean gyro sample rate between the first and last solve move (host clock). */
export function gyroRate(rec: SolveRecord): number {
  const times = rec.moves.map((m) => m.hostTs).filter((t): t is number => t !== null);
  if (times.length < 2) return 0;
  const t0 = times[0], t1 = times[times.length - 1];
  if (t1 <= t0) return 0;
  const n = rec.gyro.filter((g) => g.hostTs >= t0 && g.hostTs <= t1).length;
  return (n / (t1 - t0)) * 1000;
}
