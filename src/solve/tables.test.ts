import { describe, expect, it } from 'vitest';
import { applyMoves, solvedFacelets } from '../cube/cube';
import { randomAlgs } from '../test/random';
import { fromFacelets } from './cubie';
import { buildTables, CROSS_SOLVED, crossCoord, decodeCross, encodeCross, N_CROSS, N_MOVES } from './tables';

const t = buildTables();

describe('cross coordinate', () => {
  it('round-trips every index', () => {
    for (let i = 0; i < N_CROSS; i += 7) {
      const { pos, flip } = decodeCross(i);
      expect(encodeCross(pos, flip)).toBe(i);
    }
  });

  it('follows the cubie model through moves', () => {
    for (const alg of randomAlgs(200, 20, 5)) {
      const c = fromFacelets(applyMoves(solvedFacelets(), alg));
      let idx = CROSS_SOLVED;
      for (const tok of alg.split(' ')) {
        const mv = 'URFDLB'.indexOf(tok[0]) * 3 + (tok[1] === '2' ? 1 : tok[1] === "'" ? 2 : 0);
        idx = t.crossMove[idx * N_MOVES + mv];
      }
      expect(idx).toBe(crossCoord(c));
    }
  });
});

describe('cross distances', () => {
  it('match the known distribution of optimal cross lengths', () => {
    const counts = new Array(9).fill(0);
    for (const d of t.crossDist) counts[d]++;
    // states per optimal length 0-8 for one cross colour (190,080 in total)
    expect(counts).toEqual([1, 15, 158, 1394, 9809, 46381, 97254, 34966, 102]);
  });

  it('reach every cross + slot piece state', () => {
    const reached = (tab: Uint8Array) => tab.filter((d) => d !== 255).length;
    expect(reached(t.crossEdge)).toBe(N_CROSS * 8 * 2); // the slot edge is on one of the 8 free positions
    expect(reached(t.crossCorner)).toBe(N_CROSS * 24);
  });
});
