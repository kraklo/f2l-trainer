// Cross and xcross searches on the coordinates in tables.ts (cross on D, slot FR).

import { fromFacelets, MOVE_NAMES, type CubieCube } from './cubie';
import { CORNER_SOLVED, cornerCoord, CROSS_SOLVED, crossCoord, EDGE_SOLVED, edgeCoord, N_MOVES, N_PIECE, type Tables } from './tables';
import { type Facelets } from '../cube/cube';

const OPP = [3, 4, 5, 0, 1, 2];

/** May move `mv` follow a move on face `last`? No same-face repeats; opposite faces in one order only. */
function allowed(mv: number, last: number): boolean {
  const f = (mv / 3) | 0;
  return last < 0 || (f !== last && !(f === OPP[last] && f < last));
}

export function movesToAlg(moves: number[]): string {
  return moves.map((m) => MOVE_NAMES[m]).join(' ');
}

/**
 * Every cross solution from `coord` with length between the optimum and optimum + `extra`, as move
 * index lists. Solutions never pass through a solved cross (so no trailing U).
 */
export function crossSolutions(t: Tables, coord: number, extra = 1, max = 3000): number[][] {
  const out: number[][] = [];
  const opt = t.crossDist[coord];
  const path: number[] = [];
  const search = (c: number, depth: number, bound: number, last: number) => {
    if (out.length >= max) return;
    if (depth === bound) {
      if (c === CROSS_SOLVED) out.push(path.slice());
      return;
    }
    if (c === CROSS_SOLVED || depth + t.crossDist[c] > bound) return;
    for (let mv = 0; mv < N_MOVES; mv++) {
      if (!allowed(mv, last)) continue;
      path.push(mv);
      search(t.crossMove[c * N_MOVES + mv], depth + 1, bound, (mv / 3) | 0);
      path.pop();
    }
  };
  for (let bound = opt; bound <= opt + extra; bound++) search(coord, 0, bound, -1);
  return out;
}

export interface XCrossResult {
  moves: number[];
  nodes: number;
}

/** Shortest cross + FR-slot solution (IDA*), or null beyond maxDepth. */
export function xcrossSolve(t: Tables, c0: number, e0: number, k0: number, maxDepth = 14): XCrossResult | null {
  const path: number[] = [];
  let nodes = 0;
  const h = (c: number, e: number, k: number) => Math.max(t.crossDist[c], t.crossEdge[c * N_PIECE + e], t.crossCorner[c * N_PIECE + k]);
  const search = (c: number, e: number, k: number, depth: number, bound: number, last: number): boolean => {
    nodes++;
    if (depth + h(c, e, k) > bound) return false;
    if (c === CROSS_SOLVED && e === EDGE_SOLVED && k === CORNER_SOLVED) return true;
    for (let mv = 0; mv < N_MOVES; mv++) {
      if (!allowed(mv, last)) continue;
      path.push(mv);
      if (search(t.crossMove[c * N_MOVES + mv], t.edgeMove[e * N_MOVES + mv], t.cornerMove[k * N_MOVES + mv], depth + 1, bound, (mv / 3) | 0)) return true;
      path.pop();
    }
    return false;
  };
  for (let bound = h(c0, e0, k0); bound <= maxDepth; bound++) {
    if (search(c0, e0, k0, 0, bound, -1)) return { moves: path.slice(), nodes };
  }
  return null;
}

export function coordsOf(f: Facelets | CubieCube) {
  const c = 'cp' in f ? f : fromFacelets(f);
  return { cross: crossCoord(c), edge: edgeCoord(c), corner: cornerCoord(c) };
}
