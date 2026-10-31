// Rolling stats over solve summaries, and the F2L cases most worth drilling.

import { type SolveSummary } from './summary';

export interface CaseStat {
  case: number;
  count: number;
  /** Mean of your cost minus the best cost for that pair. */
  meanGap: number;
  /** The cheapest solution found the last time it came up. */
  example: string;
}

export interface Stats {
  solves: number;
  meanF2lMs: number;
  /** Mean cross turns over the optimal on the colour used. */
  crossExcess: number;
  /** Share of solves whose cross was optimal. */
  crossOptimalShare: number;
  /** Share of solves where an allowed colour had a shorter cross. */
  betterColourShare: number;
  /** Share of pairs where another open pair was much cheaper. */
  cheaperPairShare: number;
  /** Mean look-ahead pause before pair 1-4. */
  lookahead: number[];
  rotationsPerSolve: number;
  worstCases: CaseStat[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Stats over the most recent `last` summaries (all when omitted), oldest first in the input. */
export function aggregate(summaries: SolveSummary[], last?: number): Stats {
  const s = last ? summaries.slice(-last) : summaries;
  const pairs = s.flatMap((x) => x.pairs);
  const byCase = new Map<number, { gaps: number[]; example: string }>();
  for (const p of pairs) {
    if (p.case === null) continue;
    const e = byCase.get(p.case) ?? { gaps: [], example: '' };
    e.gaps.push(Math.max(0, p.cost - p.best));
    e.example = p.bestAlg;
    byCase.set(p.case, e);
  }
  return {
    solves: s.length,
    meanF2lMs: mean(s.map((x) => x.f2lMs)),
    crossExcess: mean(s.map((x) => x.crossTurns - x.crossOptimal)),
    crossOptimalShare: mean(s.map((x) => (x.crossTurns <= x.crossOptimal ? 1 : 0))),
    betterColourShare: mean(s.map((x) => (x.bestAllowedOptimal < x.crossOptimal ? 1 : 0))),
    cheaperPairShare: mean(pairs.map((p) => (p.cheaperSlot ? 1 : 0))),
    lookahead: [1, 2, 3, 4].map((o) => mean(pairs.filter((p) => p.order === o).map((p) => p.recognitionMs))),
    rotationsPerSolve: mean(s.map((x) => x.rotations)),
    worstCases: [...byCase]
      .map(([c, e]) => ({ case: c, count: e.gaps.length, meanGap: mean(e.gaps), example: e.example }))
      .filter((c) => c.meanGap > 0)
      .sort((a, b) => b.meanGap * Math.sqrt(b.count) - a.meanGap * Math.sqrt(a.count))
      .slice(0, 8),
  };
}
