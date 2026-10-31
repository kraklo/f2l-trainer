// Cubie-level cube for the solvers: corner/edge permutation and orientation in Kociemba order.
// Corners URF UFL ULB UBR DFR DLF DBL DRB; edges UR UF UL UB DR DF DL DB FR FL BL BR.
// A state's cp[i] is the corner at position i and co[i] its twist (likewise edges). Applying move M
// gives state·M: position i takes the piece from position M.cp[i], twisted by M.co[i].

import { FACES, type Facelets } from '../cube/cube';

export interface CubieCube {
  cp: Uint8Array;
  co: Uint8Array;
  ep: Uint8Array;
  eo: Uint8Array;
}

const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

/** Facelet indices of each corner position's stickers, starting with the U/D sticker, clockwise. */
export const CORNER_FACELETS = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
export const CORNER_COLOURS = [[U, R, F], [U, F, L], [U, L, B], [U, B, R], [D, F, R], [D, L, F], [D, B, L], [D, R, B]];
/** Facelet indices of each edge position's stickers. */
export const EDGE_FACELETS = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
export const EDGE_COLOURS = [[U, R], [U, F], [U, L], [U, B], [D, R], [D, F], [D, L], [D, B], [F, R], [F, L], [B, L], [B, R]];

export function solvedCubie(): CubieCube {
  return {
    cp: Uint8Array.from({ length: 8 }, (_, i) => i),
    co: new Uint8Array(8),
    ep: Uint8Array.from({ length: 12 }, (_, i) => i),
    eo: new Uint8Array(12),
  };
}

function cube(cp: number[], co: number[], ep: number[], eo: number[]): CubieCube {
  return { cp: Uint8Array.from(cp), co: Uint8Array.from(co), ep: Uint8Array.from(ep), eo: Uint8Array.from(eo) };
}

const Z8 = [0, 0, 0, 0, 0, 0, 0, 0], Z12 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Clockwise quarter turns of U R F D L B. */
const BASIC: CubieCube[] = [
  cube([3, 0, 1, 2, 4, 5, 6, 7], Z8, [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], Z12),
  cube([4, 1, 2, 0, 7, 5, 6, 3], [2, 0, 0, 1, 1, 0, 0, 2], [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], Z12),
  cube([1, 5, 2, 3, 0, 4, 6, 7], [1, 2, 0, 0, 2, 1, 0, 0], [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
  cube([0, 1, 2, 3, 5, 6, 7, 4], Z8, [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], Z12),
  cube([0, 2, 6, 3, 4, 1, 5, 7], [0, 1, 2, 0, 0, 2, 1, 0], [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], Z12),
  cube([0, 1, 3, 7, 4, 5, 2, 6], [0, 0, 1, 2, 0, 0, 2, 1], [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]),
];

export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  const r = solvedCubie();
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return r;
}

/** The 18 face moves, indexed face * 3 + (amount - 1), faces in URFDLB order. */
export const MOVES: CubieCube[] = BASIC.flatMap((m) => {
  const m2 = multiply(m, m);
  return [m, m2, multiply(m2, m)];
});

export const MOVE_NAMES = BASIC.flatMap((_, f) => ['', '2', "'"].map((s) => FACES[f] + s));

export function moveIndex(base: string, amount: number): number {
  const f = FACES.indexOf(base);
  if (f < 0 || amount < 1 || amount > 3) throw new Error(`Not a face move: ${base}${amount}`);
  return f * 3 + amount - 1;
}

export function fromFacelets(f: Facelets): CubieCube {
  const c = solvedCubie();
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    while (ori < 3 && f[CORNER_FACELETS[i][ori]] !== U && f[CORNER_FACELETS[i][ori]] !== D) ori++;
    const c1 = f[CORNER_FACELETS[i][(ori + 1) % 3]], c2 = f[CORNER_FACELETS[i][(ori + 2) % 3]];
    const j = CORNER_COLOURS.findIndex((cc) => cc[1] === c1 && cc[2] === c2);
    if (ori === 3 || j < 0) throw new Error('Invalid corner in facelets');
    c.cp[i] = j;
    c.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELETS[i][0]], b = f[EDGE_FACELETS[i][1]];
    const j = EDGE_COLOURS.findIndex((ec) => (ec[0] === a && ec[1] === b) || (ec[0] === b && ec[1] === a));
    if (j < 0) throw new Error('Invalid edge in facelets');
    c.ep[i] = j;
    c.eo[i] = EDGE_COLOURS[j][0] === a ? 0 : 1;
  }
  return c;
}

export function toFacelets(c: CubieCube): Facelets {
  const f = new Uint8Array(54);
  for (let i = 0; i < 6; i++) f[i * 9 + 4] = i;
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 3; k++) f[CORNER_FACELETS[i][(k + c.co[i]) % 3]] = CORNER_COLOURS[c.cp[i]][k];
  }
  for (let i = 0; i < 12; i++) {
    for (let k = 0; k < 2; k++) f[EDGE_FACELETS[i][(k + c.eo[i]) % 2]] = EDGE_COLOURS[c.ep[i]][k];
  }
  return f;
}
