import { describe, expect, it } from 'vitest';
import { applyMove, applyMoves, fromFaceletString, invertAlg, normalized, parseAlg, solvedFacelets, type Facelets } from '../cube/cube';
import { crossSolved, slotSolved } from '../cube/pieces';
import { reconstruct } from '../normalise/normalise';
import { loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { analyse } from './analyse';
import { analyseF2L } from './analyse-f2l';
import { algCost, DEFAULT_WEIGHTS, moveCost, sideOf } from './cost';
import { DEFAULT_PAIR_SEARCH, searchPair } from './f2l';
import { POSITIONS, slotAt, solvesPair, type Position } from './f2lcase';
import { buildTables } from './tables';

const t = buildTables();
const D = 3;

/** Cheapest cost of solving `target` (keeping the rest) by brute force on the sticker model. */
function bruteForceCost(view: Facelets, target: Position, keep: Position[], openAfter: number, maxCost: number): number {
  const turns = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => ['', '2', "'"].map((s) => f + s));
  let best = Infinity;
  const solved = (s: Facelets) => {
    const n = normalized(s);
    return crossSolved(n, D) && [target, ...keep].every((p) => slotSolved(n, slotAt(p)));
  };
  const dfs = (s: Facelets, cost: number, lastFace: string, lastSide: number, lastRot: boolean, yTurns: number) => {
    if (cost >= best || cost > maxCost) return;
    if (solved(s)) {
      const end = POSITIONS[(POSITIONS.indexOf(target) + yTurns) % 4];
      best = Math.min(best, cost + (openAfter > 0 && end[0] === 'F' ? DEFAULT_PAIR_SEARCH.frontPenalty : 0));
      return;
    }
    for (const mv of turns) {
      if (mv[0] === lastFace) continue;
      const m = parseAlg(mv)[0];
      const side = sideOf(m.base);
      const sw = side && lastSide && side !== lastSide ? DEFAULT_WEIGHTS.sideSwitch : 0;
      dfs(applyMove(s, m), cost + moveCost(m) + sw, mv[0], side, false, yTurns);
    }
    if (!lastRot) {
      for (const [r, n] of [['y', 1], ['y2', 2], ["y'", 3]] as const) {
        const m = parseAlg(r)[0];
        dfs(applyMove(s, m), cost + moveCost(m), lastFace, 0, true, yTurns + n);
      }
    }
  };
  dfs(view, 0, '', 0, false, 0);
  return best;
}

describe('pair search', () => {
  // short F2L situations: one slot broken by a few moves, with others solved (LL scrambled)
  const cases: [string, Position][] = [
    ["R U R'", 'FR'], ["R U' R'", 'FR'], ["F' U' F", 'FR'], ["L' U L", 'FL'], ["R' U R", 'BR'], ["L U' L'", 'BL'], ["U R U' R'", 'FR'],
  ];
  const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

  it.each(cases)('finds the cheapest solution to %s (%s), matching brute force', (setup, target) => {
    const view = applyMoves(applyMoves(solvedFacelets(), TPERM), invertAlg(setup));
    const keep = POSITIONS.filter((p) => p !== target);
    const sols = searchPair(t, view, target, keep, 0);
    expect(sols.length).toBeGreaterThan(0);
    for (const s of sols) expect(solvesPair(view, s.alg, target, keep), s.alg).toBe(true);
    expect(sols[0].cost).toBeCloseTo(bruteForceCost(view, target, keep, 0, sols[0].cost + 0.01), 6);
    expect(sols[0].cost).toBeCloseTo(algCost(sols[0].alg), 6);
  });
});

describe.skipIf(solveFixtureNames.length === 0).each(solveFixtureNames.slice(1))('F2L analysis of %s', (name) => {
  const record = replayFixture(loadSolveFixture(name));
  const recon = reconstruct(record)!;
  const decisions = analyseF2L(t, record, recon);

  it('has a decision after the cross and after each pair but the last', () => {
    expect(decisions.map((d) => d.after)).toEqual([0, 1, 2, 3]);
    expect(decisions.map((d) => d.options.length)).toEqual([4, 3, 2, 1]);
  });

  it('only suggests solutions that solve the pair and keep everything else', () => {
    for (const d of decisions) {
      const view = fromFaceletString(d.state);
      const done = POSITIONS.filter((p) => !d.options.some((o) => o.position === p));
      for (const o of d.options) {
        expect(o.search.length + o.known.length).toBeGreaterThan(0);
        for (const s of [...o.search, ...o.known]) {
          expect(solvesPair(view, s.alg, o.position, done), s.alg).toBe(true);
          // costs are computed the same way for searched and known solutions
          expect(s.cost).toBeCloseTo(algCost(s.alg) + s.penalty, 6);
        }
      }
    }
  });

  it('ranks the open slots and marks the chosen one', () => {
    for (const d of decisions) {
      const best = d.options.map((o) => o.best);
      expect(best).toEqual(best.slice().sort((a, b) => a - b));
      expect(d.options.some((o) => o.slot === d.chosen?.slot)).toBe(true);
      expect(d.cheaperSlot).toBe(d.chosen!.option!.best - d.options[0].best > 2);
    }
  });

  it('analyses the whole solve within budget', () => {
    const a = analyse(t, record)!;
    // well under 1 s locally; CI machines are slower
    expect(a.ms).toBeLessThan(2000);
  });
});
