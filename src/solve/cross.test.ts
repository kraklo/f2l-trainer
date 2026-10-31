import { describe, expect, it } from 'vitest';
import { applyMove, applyMoves, fromFaceletString, parseAlg, solvedFacelets, type Facelets } from '../cube/cube';
import { crossSolved, pairName, slotSolved, slotsFor } from '../cube/pieces';
import { reconstruct } from '../normalise/normalise';
import { loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { randomAlgs } from '../test/random';
import { analyseCross } from './analyse-cross';
import { coordsOf, crossSolutions, movesToAlg, xcrossSolve } from './cross';
import { MOVE_NAMES } from './cubie';
import { buildTables, CROSS_SOLVED, N_CROSS, N_MOVES } from './tables';
import { crossView, viewFrom } from './view';

const t = buildTables();
const D = 3;
const FR = slotsFor(D).find((s) => pairName(s.faces[0], s.faces[1]) === 'red-green')!;
const scrambles = randomAlgs(50, 25, 42);

describe('cross distance table', () => {
  it('is consistent: every state is one move further than its best neighbour', () => {
    for (let c = 0; c < N_CROSS; c++) {
      if (c === CROSS_SOLVED) continue;
      let best = 255;
      for (let mv = 0; mv < N_MOVES; mv++) best = Math.min(best, t.crossDist[t.crossMove[c * N_MOVES + mv]]);
      if (t.crossDist[c] !== best + 1) throw new Error(`inconsistent at ${c}`);
    }
  });
});

describe('cross solutions on 50 scrambles, every colour', () => {
  it('are optimal or optimal + 1 and solve the cross in the sticker model', () => {
    for (const scramble of scrambles) {
      const core = applyMoves(solvedFacelets(), scramble);
      for (let colour = 0; colour < 6; colour++) {
        const v = crossView(core, colour);
        const { cross } = coordsOf(v.facelets);
        const opt = t.crossDist[cross];
        const sols = crossSolutions(t, cross);
        expect(sols.length).toBeGreaterThan(0);
        expect(sols[0].length).toBe(opt);
        for (const s of sols) {
          expect(s.length === opt || s.length === opt + 1).toBe(true);
          expect(crossSolved(applyMoves(v.facelets, movesToAlg(s)), D)).toBe(true);
        }
      }
    }
  });
});

/** Shortest cross + FR solution length by brute force on the sticker model (small depths only). */
function bruteForceXcross(f: Facelets, maxDepth: number): number {
  const solved = (s: Facelets) => crossSolved(s, D) && slotSolved(s, FR);
  const dfs = (s: Facelets, depth: number, last: string): boolean => {
    if (solved(s)) return true;
    if (depth === 0) return false;
    for (const name of MOVE_NAMES) {
      if (name[0] === last) continue;
      if (dfs(applyMove(s, parseAlg(name)[0]), depth - 1, name[0])) return true;
    }
    return false;
  };
  for (let d = 0; d <= maxDepth; d++) if (dfs(f, d, '')) return d;
  return Infinity;
}

describe('xcross', () => {
  it('finds solutions that solve the cross and slot, of optimal length on short cases', () => {
    for (const setup of randomAlgs(8, 4, 9)) {
      const f = applyMoves(solvedFacelets(), setup);
      const { cross, edge, corner } = coordsOf(f);
      const res = xcrossSolve(t, cross, edge, corner)!;
      const after = applyMoves(f, movesToAlg(res.moves));
      expect(crossSolved(after, D) && slotSolved(after, FR)).toBe(true);
      expect(res.moves.length).toBe(bruteForceXcross(f, 4));
    }
  });

  it('solves every slot of 10 scrambles, with valid solutions', { timeout: 60000 }, () => {
    for (const scramble of scrambles.slice(0, 10)) {
      const core = applyMoves(solvedFacelets(), scramble);
      for (const y of ['', 'y', 'y2', "y'"]) {
        const v = viewFrom(core, y);
        const { cross, edge, corner } = coordsOf(v.facelets);
        const res = xcrossSolve(t, cross, edge, corner)!;
        const after = applyMoves(v.facelets, movesToAlg(res.moves));
        expect(crossSolved(after, D) && slotSolved(after, FR)).toBe(true);
        expect(res.moves.length).toBeGreaterThanOrEqual(t.crossDist[cross]);
      }
    }
  });
});

describe.skipIf(solveFixtureNames.length === 0).each(solveFixtureNames.slice(1))('cross analysis of %s', (name) => {
  const record = replayFixture(loadSolveFixture(name));
  const recon = reconstruct(record)!;

  it('reports verified crosses and xcrosses within a second', () => {
    const start = performance.now();
    const a = analyseCross(t, record, recon);
    const ms = performance.now() - start;
    const core = fromFaceletString(record.startFacelets);
    expect(a.used.colour).toBe(recon.cross);
    expect(a.used.optimal).toBeLessThanOrEqual(a.used.turns);
    expect(a.colours).toHaveLength(6);
    for (const c of a.colours) {
      for (const s of c.solutions) {
        // in the colour's grip, the solution leaves that colour's cross solved on D
        expect(crossSolved(applyMoves(viewFrom(core, c.rotation).facelets, s.alg), D)).toBe(true);
      }
    }
    for (const x of a.xcross.perColour) {
      const v = viewFrom(core, x.rotation);
      expect(v.colours[D]).toBe(x.colour);
      const after = applyMoves(v.facelets, x.alg);
      expect(crossSolved(after, D) && slotSolved(after, FR)).toBe(true);
      expect(pairName(v.colours[2], v.colours[1])).toBe(x.slot);
    }
    expect(ms).toBeLessThan(1000);
  });
});
