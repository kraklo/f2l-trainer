// Human cost of a move sequence. Raw move count favours awkward F, B and D turns, so suggestions are
// ranked by how easy they are to execute instead. All weights are configurable.

import { parseAlg, type Move } from '../cube/cube';

export interface CostWeights {
  /** Quarter-turn cost per face or rotation. */
  quarter: Record<string, number>;
  /** Half turns cost this multiple of the quarter turn. */
  halfFactor: number;
  /** Added when a right-hand turn (R, r) directly follows a left-hand one (L, l), or vice versa. */
  sideSwitch: number;
}

export const DEFAULT_WEIGHTS: CostWeights = {
  quarter: { U: 1, R: 1, L: 1.1, F: 1.6, D: 1.6, B: 2, y: 1.5, x: 2, z: 2, r: 1.2, l: 1.3, M: 1.4, d: 1.6, u: 1.6, f: 1.8, b: 2.2, E: 2, S: 2 },
  halfFactor: 1.3,
  sideSwitch: 0.5,
};

/** 1 for right-hand turns, 2 for left-hand turns, 0 otherwise. */
export function sideOf(base: string): number {
  return base === 'R' || base === 'r' ? 1 : base === 'L' || base === 'l' ? 2 : 0;
}

export function moveCost(m: Move, w = DEFAULT_WEIGHTS): number {
  const q = w.quarter[m.base] ?? 2;
  return m.amount === 2 ? q * w.halfFactor : q;
}

export function algCost(alg: string | Move[], w = DEFAULT_WEIGHTS): number {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg;
  let sum = 0, side = 0;
  for (const m of moves) {
    const s = sideOf(m.base);
    if (s && side && s !== side) sum += w.sideSwitch;
    side = s;
    sum += moveCost(m, w);
  }
  return sum;
}
