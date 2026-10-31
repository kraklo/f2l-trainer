// A compact per-solve summary of the analysis, cached so History doesn't re-analyse every solve.

import { type SolveRecord } from '../record/types';
import { type Analysis } from '../solve/analyse';

export const SUMMARY_VERSION = 2; // bump when the analysis changes so History recomputes

export interface PairSummary {
  /** 1-4: which pair of the solve this was. */
  order: number;
  slot: string;
  case: number | null;
  turns: number;
  cost: number;
  /** Cheapest cost found for the same pair. */
  best: number;
  bestAlg: string;
  cheaperSlot: boolean;
  recognitionMs: number;
}

export interface SolveSummary {
  version: number;
  id: string;
  startedAt: number;
  f2lMs: number;
  crossColour: number;
  crossTurns: number;
  crossOptimal: number;
  /** Optimal cross on the best allowed colour. */
  bestAllowedOptimal: number;
  /** Whole-cube rotations during the cross and F2L. */
  rotations: number;
  pairs: PairSummary[];
}

export function summarise(record: SolveRecord, a: Analysis): SolveSummary {
  const segs = a.recon.segments;
  const f2l = segs.filter((s) => s.kind !== 'll');
  const pairs: PairSummary[] = [];
  for (const d of a.f2l) {
    const seg = segs[d.after + 1];
    const o = d.chosen?.option;
    if (!d.chosen || !o || !seg?.turns) continue; // finished together with the previous stage
    const best = [...o.search, ...o.known].sort((x, y) => x.cost - y.cost)[0];
    pairs.push({
      order: d.after + 1, slot: o.slot, case: o.case, turns: seg.turns, cost: d.chosen.cost, best: o.best,
      bestAlg: best?.alg ?? '', cheaperSlot: d.cheaperSlot, recognitionMs: seg.recognitionMs,
    });
  }
  return {
    version: SUMMARY_VERSION,
    id: record.id,
    startedAt: record.startedAt,
    f2lMs: f2l.reduce((s, x) => s + x.durationMs, 0),
    crossColour: a.cross.used.colour,
    crossTurns: a.cross.used.turns,
    crossOptimal: a.cross.used.optimal,
    bestAllowedOptimal: a.cross.colours.find((c) => c.colour === a.cross.bestAllowedColour)?.optimal ?? a.cross.used.optimal,
    rotations: f2l.reduce((s, x) => s + x.rotations, 0),
    pairs,
  };
}
