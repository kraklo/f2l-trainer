// Personal cost weights, fitted from how long each kind of move actually takes you.
//
// A move's time is from the end of the previous token to the end of this one (transition plus
// execution), skipping gaps over MAX_MOVE_MS, which are thinking rather than turning. Weights are
// each move type's median time relative to a U or R quarter turn, so 1.0 still means "as easy as U
// or R". The hand-switch cost is the median extra time when an R turn directly follows an L turn or
// vice versa.

import { type Reconstruction } from '../normalise/normalise';
import { DEFAULT_WEIGHTS, sideOf } from '../solve/cost';

export interface PersonalWeights {
  quarter: Record<string, number>;
  half: Record<string, number>;
  sideSwitch: number;
  /** Samples behind each fitted weight, keyed like 'R' or 'R2'. */
  samples: Record<string, number>;
  solves: number;
  fittedAt: number;
}

export interface MoveTiming {
  /** Move type: base, plus '2' for half turns (primes count as quarters). */
  key: string;
  ms: number;
  /** Followed a turn with the other hand. */
  switched: boolean;
}

/** Longer gaps are look-ahead pauses, not move execution. */
export const MAX_MOVE_MS = 600;

export function moveTimings(recon: Reconstruction, maxMs = MAX_MOVE_MS): MoveTiming[] {
  const out: MoveTiming[] = [];
  const toks = recon.tokens;
  for (let i = 1; i < toks.length; i++) {
    const prev = toks[i - 1], tok = toks[i];
    const ms = tok.tEnd - prev.tEnd;
    if (ms <= 0 || ms > maxMs) continue;
    const a = sideOf(prev.move.base), b = sideOf(tok.move.base);
    out.push({ key: tok.move.base + (tok.move.amount === 2 ? '2' : ''), ms, switched: !!a && !!b && a !== b });
  }
  return out;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** Fitted weights, or null without enough U/R turns to set the scale. */
export function fitWeights(timings: MoveTiming[], solves: number, minSamples = 15): PersonalWeights | null {
  const groups = new Map<string, number[]>();
  for (const t of timings) if (!t.switched) groups.set(t.key, [...(groups.get(t.key) ?? []), t.ms]);
  const base = [...(groups.get('U') ?? []), ...(groups.get('R') ?? [])];
  if (base.length < minSamples) return null;
  const unit = median(base);

  const quarter: Record<string, number> = {}, half: Record<string, number> = {}, samples: Record<string, number> = {};
  for (const [key, ms] of groups) {
    if (ms.length < minSamples) continue;
    samples[key] = ms.length;
    if (key.endsWith('2')) half[key[0]] = round(median(ms) / unit);
    else quarter[key] = round(median(ms) / unit);
  }

  const switched = timings.filter((t) => t.switched);
  let sideSwitch = DEFAULT_WEIGHTS.sideSwitch;
  if (switched.length >= minSamples) {
    const weightOf = (key: string) => (key.endsWith('2') ? half[key[0]] ?? (quarter[key[0]] ?? DEFAULT_WEIGHTS.quarter[key[0]]) * DEFAULT_WEIGHTS.halfFactor : quarter[key] ?? DEFAULT_WEIGHTS.quarter[key]);
    sideSwitch = round(Math.max(0, median(switched.map((t) => t.ms / unit - weightOf(t.key)))));
    samples.switch = switched.length;
  }
  return { quarter, half, sideSwitch, samples, solves, fittedAt: Date.now() };
}
