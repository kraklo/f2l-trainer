import { cube3x3x3 } from 'cubing/puzzles';
import { describe, expect, it } from 'vitest';
import { randomAlgs } from '../test/random';
import { applyMoves, parseAlg, solvedFacelets, toFaceletString, type Facelets } from '../cube/cube';
import { fromFacelets, MOVES, moveIndex, multiply, solvedCubie, toFacelets, type CubieCube } from './cubie';

function applyCubie(c: CubieCube, alg: string): CubieCube {
  for (const m of parseAlg(alg)) c = multiply(c, MOVES[moveIndex(m.base, m.amount)]);
  return c;
}

// Sticker indices of cubing.js's (Reid order) piece positions, listed in each piece's own sticker order.
const REID_EDGES = [[7, 19], [5, 10], [1, 46], [3, 37], [28, 25], [32, 16], [34, 52], [30, 43], [23, 12], [21, 41], [48, 14], [50, 39]];
const REID_CORNERS = [[8, 20, 9], [2, 11, 45], [0, 47, 36], [6, 38, 18], [29, 15, 26], [27, 24, 44], [33, 42, 53], [35, 51, 17]];

/** Facelets of a KPuzzle pattern, read through its piece/orientation data. */
function kpuzzleFacelets(data: Record<string, { pieces: number[]; orientation: number[] }>): Facelets {
  const solved = solvedFacelets();
  const f = new Uint8Array(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i;
  for (const [orbit, stickers] of [['EDGES', REID_EDGES], ['CORNERS', REID_CORNERS]] as const) {
    const { pieces, orientation } = data[orbit];
    stickers.forEach((pos, i) => {
      const n = pos.length;
      pos.forEach((facelet, k) => (f[facelet] = solved[stickers[pieces[i]][(k + orientation[i]) % n]]));
    });
  }
  return f;
}

describe('cubie model', () => {
  it('converts facelets both ways', () => {
    for (const alg of randomAlgs(200, 25)) {
      const f = applyMoves(solvedFacelets(), alg);
      expect(toFaceletString(toFacelets(fromFacelets(f)))).toBe(toFaceletString(f));
    }
  });

  it('agrees with the sticker model on 1000 random algs', () => {
    for (const alg of randomAlgs(1000, 25, 7)) {
      expect(toFaceletString(toFacelets(applyCubie(solvedCubie(), alg)))).toBe(toFaceletString(applyMoves(solvedFacelets(), alg)));
    }
  });

  it('agrees with cubing.js KPuzzle on 1000 random algs', async () => {
    const kp = await cube3x3x3.kpuzzle();
    for (const alg of randomAlgs(1000, 25, 11)) {
      const data = kp.defaultPattern().applyAlg(alg).patternData as unknown as Record<string, { pieces: number[]; orientation: number[] }>;
      expect(toFaceletString(kpuzzleFacelets(data))).toBe(toFaceletString(toFacelets(applyCubie(solvedCubie(), alg))));
    }
  });
});
