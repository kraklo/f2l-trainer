// Coordinates and pruning tables for the cross and xcross searches, all with the cross on D.
//
// Cross: the D edges (DR DF DL DB = edges 4-7) by position and flip, 12·11·10·9·2⁴ = 190,080 states.
// Slot pieces (for the FR slot; other slots are searched by viewing the cube after y turns):
// the FR edge (12 positions × 2 flips) and the DFR corner (8 positions × 3 twists), 24 states each.
// crossEdge and crossCorner give exact distances for cross + that one piece; their max with the cross
// distance is an admissible xcross heuristic.

import { MOVES, type CubieCube } from './cubie';

export const N_MOVES = 18;
export const N_CROSS = 190080;
export const N_PIECE = 24;
const CROSS_EDGES = [4, 5, 6, 7];
export const SLOT_EDGE = 8; // FR
export const SLOT_CORNER = 4; // DFR

export function encodeCross(pos: number[], flip: number[]): number {
  let perm = 0, radix = 12;
  for (let k = 0; k < 4; k++) {
    let r = pos[k];
    for (let j = 0; j < k; j++) if (pos[j] < pos[k]) r--;
    perm = perm * radix + r;
    radix--;
  }
  return perm * 16 + (flip[0] | (flip[1] << 1) | (flip[2] << 2) | (flip[3] << 3));
}

export function decodeCross(idx: number): { pos: number[]; flip: number[] } {
  const flipBits = idx % 16;
  let perm = Math.floor(idx / 16);
  const ranks = [0, 0, 0, 0];
  for (let k = 3, radix = 9; k >= 0; k--, radix++) {
    ranks[k] = perm % radix;
    perm = Math.floor(perm / radix);
  }
  const free = Array.from({ length: 12 }, (_, i) => i);
  const pos = ranks.map((r) => free.splice(r, 1)[0]);
  return { pos, flip: [0, 1, 2, 3].map((k) => (flipBits >> k) & 1) };
}

export const CROSS_SOLVED = encodeCross([4, 5, 6, 7], [0, 0, 0, 0]);
export const EDGE_SOLVED = SLOT_EDGE * 2;
export const CORNER_SOLVED = SLOT_CORNER * 3;

// Where each move sends a piece at position p, and the twist it adds.
const EDGE_TO: number[][] = MOVES.map((m) => {
  const to = new Array<number>(12);
  m.ep.forEach((from, i) => (to[from] = i));
  return to;
});
const CORNER_TO: number[][] = MOVES.map((m) => {
  const to = new Array<number>(8);
  m.cp.forEach((from, i) => (to[from] = i));
  return to;
});

function movePieces(pos: number[], flip: number[], mv: number) {
  const m = MOVES[mv];
  const np = pos.map((p) => EDGE_TO[mv][p]);
  return { pos: np, flip: flip.map((f, k) => f ^ m.eo[np[k]]) };
}

export interface Tables {
  crossMove: Uint32Array;
  crossDist: Uint8Array;
  edgeMove: Uint8Array;
  cornerMove: Uint8Array;
  crossEdge: Uint8Array;
  crossCorner: Uint8Array;
}

export function buildMoveTables(): Pick<Tables, 'crossMove' | 'edgeMove' | 'cornerMove'> {
  const crossMove = new Uint32Array(N_CROSS * N_MOVES);
  for (let c = 0; c < N_CROSS; c++) {
    const { pos, flip } = decodeCross(c);
    for (let mv = 0; mv < N_MOVES; mv++) {
      const n = movePieces(pos, flip, mv);
      crossMove[c * N_MOVES + mv] = encodeCross(n.pos, n.flip);
    }
  }
  const edgeMove = new Uint8Array(N_PIECE * N_MOVES);
  const cornerMove = new Uint8Array(N_PIECE * N_MOVES);
  for (let mv = 0; mv < N_MOVES; mv++) {
    const m = MOVES[mv];
    for (let p = 0; p < 12; p++) {
      const to = EDGE_TO[mv][p];
      for (let f = 0; f < 2; f++) edgeMove[(p * 2 + f) * N_MOVES + mv] = to * 2 + (f ^ m.eo[to]);
    }
    for (let p = 0; p < 8; p++) {
      const to = CORNER_TO[mv][p];
      for (let t = 0; t < 3; t++) cornerMove[(p * 3 + t) * N_MOVES + mv] = to * 3 + ((t + m.co[to]) % 3);
    }
  }
  return { crossMove, edgeMove, cornerMove };
}

/** Breadth-first distances from `start` over a (cross × piece) product space. */
function bfs(size: number, start: number, next: (idx: number, mv: number) => number): Uint8Array {
  const dist = new Uint8Array(size).fill(255);
  const queue = new Uint32Array(size);
  let head = 0, tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const idx = queue[head++];
    const d = dist[idx] + 1;
    for (let mv = 0; mv < N_MOVES; mv++) {
      const n = next(idx, mv);
      if (dist[n] === 255) {
        dist[n] = d;
        queue[tail++] = n;
      }
    }
  }
  return dist;
}

export function buildPruningTables(m: Pick<Tables, 'crossMove' | 'edgeMove' | 'cornerMove'>): Pick<Tables, 'crossDist' | 'crossEdge' | 'crossCorner'> {
  const { crossMove, edgeMove, cornerMove } = m;
  const crossDist = bfs(N_CROSS, CROSS_SOLVED, (c, mv) => crossMove[c * N_MOVES + mv]);
  const product = (pieceMove: Uint8Array, solved: number) =>
    bfs(N_CROSS * N_PIECE, CROSS_SOLVED * N_PIECE + solved, (idx, mv) => {
      const c = (idx / N_PIECE) | 0, p = idx - c * N_PIECE;
      return crossMove[c * N_MOVES + mv] * N_PIECE + pieceMove[p * N_MOVES + mv];
    });
  return { crossDist, crossEdge: product(edgeMove, EDGE_SOLVED), crossCorner: product(cornerMove, CORNER_SOLVED) };
}

export function buildTables(): Tables {
  const moves = buildMoveTables();
  return { ...moves, ...buildPruningTables(moves) };
}

/** Coordinates of a cubie state (cross on D) for the searches. */
export function crossCoord(c: CubieCube): number {
  const pos = CROSS_EDGES.map((e) => c.ep.indexOf(e));
  return encodeCross(pos, pos.map((p) => c.eo[p]));
}

export function edgeCoord(c: CubieCube, edge = SLOT_EDGE): number {
  const p = c.ep.indexOf(edge);
  return p * 2 + c.eo[p];
}

export function cornerCoord(c: CubieCube, corner = SLOT_CORNER): number {
  const p = c.cp.indexOf(corner);
  return p * 3 + c.co[p];
}
