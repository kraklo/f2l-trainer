// Scrambles from whatever state the cube is in. Look-ahead solves stop when F2L is done, so the next
// scramble starts from an unsolved last layer.
//
// You turn a random-state scramble from where the cube is, which lands on a uniformly random state.
// The record still needs a scramble from solved (the analysis replays everything from solved), so
// that state is solved with cubing.js and the solution inverted.

import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search';
import { cube3x3x3 } from 'cubing/puzzles';
import { KPattern, type KPatternData } from 'cubing/kpuzzle';
import { randomScrambleForEvent } from 'cubing/scramble';
import '../scramble-setup';
import { applyMoves, equalFacelets, invertAlg, solvedFacelets, type Facelets } from '../cube/cube';

// Sticker indices of cubing.js's (Reid order) piece positions, listed in each piece's own sticker order.
export const REID_EDGES = [[7, 19], [5, 10], [1, 46], [3, 37], [28, 25], [32, 16], [34, 52], [30, 43], [23, 12], [21, 41], [48, 14], [50, 39]];
export const REID_CORNERS = [[8, 20, 9], [2, 11, 45], [0, 47, 36], [6, 38, 18], [29, 15, 26], [27, 24, 44], [33, 42, 53], [35, 51, 17]];

/** KPuzzle pattern data (edges and corners; centres fixed) of a facelet state. */
export function patternData(f: Facelets): KPatternData {
  const solved = solvedFacelets();
  const orbit = (stickers: number[][]) => {
    const pieces: number[] = [], orientation: number[] = [];
    stickers.forEach((pos, i) => {
      const n = pos.length;
      for (let p = 0; p < stickers.length; p++) {
        for (let o = 0; o < n; o++) {
          if (pos.every((facelet, k) => f[facelet] === solved[stickers[p][(k + o) % n]])) {
            pieces[i] = p;
            orientation[i] = o;
          }
        }
      }
      if (pieces[i] === undefined) throw new Error('Not a valid cube state');
    });
    return { pieces, orientation };
  };
  return {
    EDGES: orbit(REID_EDGES),
    CORNERS: orbit(REID_CORNERS),
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0] },
  };
}

/** An alg that takes a solved cube to this state. */
export async function scrambleTo(f: Facelets): Promise<string> {
  if (equalFacelets(f, solvedFacelets())) return '';
  const kpuzzle = await cube3x3x3.kpuzzle();
  const solution = await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle, patternData(f)));
  return invertAlg(solution.toString());
}

export interface Rescramble {
  /** What to turn, from the current state. */
  shown: string;
  /** The same end state as a scramble from solved, for the record. */
  fromSolved: string;
}

export async function rescramble(current: Facelets): Promise<Rescramble> {
  const shown = (await randomScrambleForEvent('333')).toString();
  if (equalFacelets(current, solvedFacelets())) return { shown, fromSolved: shown };
  const fromSolved = await scrambleTo(applyMoves(current, shown));
  return { shown, fromSolved };
}
