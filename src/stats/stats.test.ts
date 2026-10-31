import { describe, expect, it } from 'vitest';
import { parseAlg } from '../cube/cube';
import { type Reconstruction } from '../normalise/normalise';
import { analyse } from '../solve/analyse';
import { buildTables } from '../solve/tables';
import { loadExpected, loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { aggregate } from './aggregate';
import { summarise } from './summary';
import { fitWeights, moveTimings } from './weights';

/** A reconstruction whose moves take `unit × weight` ms each (with ±8% jitter). */
function syntheticRecon(alg: string, unit: number, weight: (key: string, prev: string) => number): Reconstruction {
  let t = 0, prev = '', seed = 3;
  const jitter = () => 1 + ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.16;
  const tokens = parseAlg(alg).map((move, i) => {
    const key = move.base + (move.amount === 2 ? '2' : '');
    t += unit * weight(key, prev) * jitter();
    prev = move.base;
    return { move, t, tEnd: t, src: [i], rotation: 'xyz'.includes(move.base), frame: 0 };
  });
  return { tokens } as unknown as Reconstruction;
}

describe('fitWeights', () => {
  it('recovers known move weights and the hand-switch cost from timings', () => {
    const truth: Record<string, number> = { U: 1, R: 1, L: 1.2, F: 1.7, D: 1.5, B: 2.2, y: 1.6, U2: 1.4, R2: 1.5, y2: 2.1 };
    const block = "R U R' U' L' U L F R U R' U' F' D R' D' y R U2 R' y2 B U B' R2 U2 R2 L' U' L U2 R U R' y L' U L";
    const switchCost = 0.4;
    const recon = syntheticRecon(Array(12).fill(block).join(' '), 180, (key, prev) =>
      truth[key] + ((key[0] === 'R' && prev === 'L') || (key[0] === 'L' && prev === 'R') ? switchCost : 0));
    const w = fitWeights(moveTimings(recon, 2000), 1, 8)!;
    for (const [key, v] of Object.entries(truth)) {
      const fitted = key.endsWith('2') ? w.half[key[0]] : w.quarter[key];
      expect(Math.abs(fitted - v), key).toBeLessThan(0.1);
    }
    expect(Math.abs(w.sideSwitch - switchCost)).toBeLessThan(0.1);
  });

  it('needs enough U and R turns to set the scale', () => {
    expect(fitWeights(moveTimings(syntheticRecon("F B F' B'", 200, () => 1)), 1)).toBeNull();
  });
});

describe.skipIf(!solveFixtureNames.some((n) => loadExpected(n)))('stats over the recorded solves', () => {
  const t = buildTables();
  const records = solveFixtureNames.filter((n) => loadExpected(n)).map((n) => replayFixture(loadSolveFixture(n)));
  const analyses = records.map((r) => analyse(t, r)!);
  const summaries = records.map((r, i) => summarise(r, analyses[i]));

  it('summarises each solve', () => {
    for (const s of summaries) {
      expect(s.crossTurns).toBeGreaterThanOrEqual(s.crossOptimal);
      expect(s.pairs.map((p) => p.order)).toEqual([1, 2, 3, 4]);
      for (const p of s.pairs) expect(p.cost).toBeGreaterThan(0);
    }
  });

  it('aggregates them', () => {
    const st = aggregate(summaries);
    expect(st.solves).toBe(summaries.length);
    expect(st.crossExcess).toBeCloseTo(summaries.reduce((a, s) => a + s.crossTurns - s.crossOptimal, 0) / summaries.length, 6);
    expect(st.cheaperPairShare).toBeGreaterThanOrEqual(0);
    expect(st.cheaperPairShare).toBeLessThanOrEqual(1);
    expect(st.lookahead).toHaveLength(4);
    expect(st.lookahead.every((x) => x > 0)).toBe(true);
    expect(st.worstCases.length).toBeGreaterThan(0);
    expect(aggregate(summaries, 2).solves).toBe(2);
  });

  it('fits weights from the recorded solves', () => {
    const w = fitWeights(analyses.flatMap((a) => moveTimings(a.recon)), records.length);
    expect(w).not.toBeNull();
    expect(w!.quarter.U).toBeGreaterThan(0.5);
    expect(w!.quarter.U).toBeLessThan(2);
  });
});
