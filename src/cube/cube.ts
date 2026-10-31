// Sticker-level 3x3 model. Facelets use the URFDLB order (same as cstimer / Kociemba):
// U1..U9, R1..R9, F1..F9, D1..D9, L1..L9, B1..B9, each face read row by row as seen from outside.
// A facelet array holds, for each position, the face id (0-5) whose colour is on it.

export const FACES = 'URFDLB';
export const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

export type Facelets = Uint8Array;

type Vec = [number, number, number];

// Position (cubie coords in -1..1) and outward normal for every facelet.
const POS: Vec[] = [];
const NORMAL: Vec[] = [];

(function buildGeometry() {
  // For each face: normal and a function mapping (row, col) to 3D position.
  const faces: [Vec, (r: number, c: number) => Vec][] = [
    [[0, 1, 0], (r, c) => [c - 1, 1, r - 1]],   // U: rows back->front, cols left->right
    [[1, 0, 0], (r, c) => [1, 1 - r, 1 - c]],   // R: cols front->back
    [[0, 0, 1], (r, c) => [c - 1, 1 - r, 1]],   // F
    [[0, -1, 0], (r, c) => [c - 1, -1, 1 - r]], // D: rows front->back
    [[-1, 0, 0], (r, c) => [-1, 1 - r, c - 1]], // L: cols back->front
    [[0, 0, -1], (r, c) => [1 - c, 1 - r, -1]], // B: cols right->left
  ];
  for (const [n, pos] of faces) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        POS.push(pos(r, c));
        NORMAL.push(n);
      }
    }
  }
})();

function key(p: Vec, n: Vec) {
  return p.join(',') + '|' + n.join(',');
}
const INDEX = new Map<string, number>();
POS.forEach((p, i) => INDEX.set(key(p, NORMAL[i]), i));

// Clockwise quarter turn about the positive axis (as seen looking at that face).
function rotCW(v: Vec, axis: number): Vec {
  const [x, y, z] = v;
  if (axis === 0) return [x, z, -y];
  if (axis === 1) return [-z, y, x];
  return [y, -x, z];
}

// axis: 0=x 1=y 2=z; dir: +1 turns like R/U/F, -1 like L/D/B; layers: coordinates included.
interface MoveDef { axis: number; dir: number; layers: number[] }

const MOVE_DEFS: Record<string, MoveDef> = {
  R: { axis: 0, dir: 1, layers: [1] },
  L: { axis: 0, dir: -1, layers: [-1] },
  U: { axis: 1, dir: 1, layers: [1] },
  D: { axis: 1, dir: -1, layers: [-1] },
  F: { axis: 2, dir: 1, layers: [1] },
  B: { axis: 2, dir: -1, layers: [-1] },
  r: { axis: 0, dir: 1, layers: [1, 0] },
  l: { axis: 0, dir: -1, layers: [-1, 0] },
  u: { axis: 1, dir: 1, layers: [1, 0] },
  d: { axis: 1, dir: -1, layers: [-1, 0] },
  f: { axis: 2, dir: 1, layers: [1, 0] },
  b: { axis: 2, dir: -1, layers: [-1, 0] },
  M: { axis: 0, dir: -1, layers: [0] },
  E: { axis: 1, dir: -1, layers: [0] },
  S: { axis: 2, dir: 1, layers: [0] },
  x: { axis: 0, dir: 1, layers: [-1, 0, 1] },
  y: { axis: 1, dir: 1, layers: [-1, 0, 1] },
  z: { axis: 2, dir: 1, layers: [-1, 0, 1] },
};

// PERM[name][j] = i means after one clockwise quarter of `name`, position j holds what was at i.
const PERM: Record<string, Int8Array> = {};
for (const [name, def] of Object.entries(MOVE_DEFS)) {
  const perm = new Int8Array(54);
  for (let i = 0; i < 54; i++) {
    let p = POS[i], n = NORMAL[i];
    if (def.layers.includes(p[def.axis])) {
      const turns = def.dir === 1 ? 1 : 3;
      for (let t = 0; t < turns; t++) {
        p = rotCW(p, def.axis);
        n = rotCW(n, def.axis);
      }
    }
    perm[INDEX.get(key(p, n))!] = i;
  }
  PERM[name] = perm;
}

export interface Move {
  base: string;   // one of the MOVE_DEFS keys
  amount: number; // 1, 2 or 3 (3 = prime)
}

const TOKEN = /^([URFDLBurfdlbMESxyz])(w?)(\d*)('?)$/;

export function parseAlg(alg: string): Move[] {
  const moves: Move[] = [];
  for (const raw of alg.replace(/[()[\]]/g, ' ').split(/\s+/)) {
    if (!raw) continue;
    const m = TOKEN.exec(raw.replace(/’/g, "'"));
    if (!m) throw new Error(`Cannot parse move "${raw}" in "${alg}"`);
    let base = m[1];
    if (m[2]) base = base.toLowerCase();
    let amount = m[3] ? parseInt(m[3], 10) % 4 : 1;
    if (m[4]) amount = (4 - amount) % 4;
    if (amount) moves.push({ base, amount });
  }
  return moves;
}

export function moveToString(m: Move): string {
  return m.base + ['', '', '2', "'"][m.amount];
}

export function algToString(moves: Move[]): string {
  return moves.map(moveToString).join(' ');
}

export function invertMoves(moves: Move[]): Move[] {
  return moves.slice().reverse().map((m) => ({ base: m.base, amount: (4 - m.amount) % 4 }));
}

export function invertAlg(alg: string): string {
  return algToString(invertMoves(parseAlg(alg)));
}

export function solvedFacelets(): Facelets {
  const f = new Uint8Array(54);
  for (let i = 0; i < 54; i++) f[i] = Math.floor(i / 9);
  return f;
}

export function applyMove(state: Facelets, m: Move): Facelets {
  const perm = PERM[m.base];
  let cur = state;
  for (let t = 0; t < m.amount; t++) {
    const next = new Uint8Array(54);
    for (let j = 0; j < 54; j++) next[j] = cur[perm[j]];
    cur = next;
  }
  return cur;
}

export function applyMoves(state: Facelets, moves: Move[] | string): Facelets {
  const list = typeof moves === 'string' ? parseAlg(moves) : moves;
  let cur = state;
  for (const m of list) cur = applyMove(cur, m);
  return cur;
}

export function equalFacelets(a: Facelets, b: Facelets): boolean {
  for (let i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toFaceletString(state: Facelets): string {
  return Array.from(state, (v) => FACES[v]).join('');
}

export function fromFaceletString(s: string): Facelets {
  if (s.length !== 54) throw new Error(`Bad facelet string length ${s.length}`);
  return Uint8Array.from(s, (ch) => {
    const v = FACES.indexOf(ch);
    if (v < 0) throw new Error(`Bad facelet '${ch}'`);
    return v;
  });
}

const CENTERS = [4, 13, 22, 31, 40, 49];

// All 24 whole-cube rotations, as the shortest x/y/z sequences reaching each center arrangement.
const ROTATIONS: { alg: string; centers: string }[] = (() => {
  const seen = new Map<string, string>();
  let frontier: [Facelets, string][] = [[solvedFacelets(), '']];
  const centerKey = (f: Facelets) => CENTERS.map((c) => f[c]).join('');
  seen.set(centerKey(frontier[0][0]), '');
  while (frontier.length) {
    const next: [Facelets, string][] = [];
    for (const [f, alg] of frontier) {
      for (const base of ['x', 'y', 'z']) {
        for (const amount of [1, 2, 3]) {
          const g = applyMove(f, { base, amount });
          const k = centerKey(g);
          if (!seen.has(k)) {
            const a = (alg + ' ' + moveToString({ base, amount })).trim();
            seen.set(k, a);
            next.push([g, a]);
          }
        }
      }
    }
    frontier = next;
  }
  return Array.from(seen, ([centers, alg]) => ({ alg, centers }));
})();

function centersHome(state: Facelets): boolean {
  return CENTERS.every((c, i) => state[c] === i);
}

/** Rotation alg that brings the centers of `state` back to their home positions. */
export function normalizingRotation(state: Facelets): string {
  for (const { alg } of ROTATIONS) {
    if (centersHome(applyMoves(state, alg))) return alg;
  }
  throw new Error('Unreachable center arrangement');
}

/** `state` viewed with its centers in their home positions. */
export function normalized(state: Facelets): Facelets {
  return applyMoves(state, normalizingRotation(state));
}

/**
 * Setup alg producing the case that `alg` solves: the alg's inverse, preceded by the rotation that
 * puts the cube in the orientation the alg finishes in, so the case ends up with its centers home.
 */
export function setupFor(alg: string): string {
  const inverse = invertAlg(alg);
  for (const { alg: rot } of ROTATIONS) {
    const setup = (rot + ' ' + inverse).trim();
    if (centersHome(applyMoves(solvedFacelets(), setup))) return setup;
  }
  throw new Error('Unreachable center arrangement');
}

/** Rotation (x/y/z alg) that takes a cube held with `top`/`front` face colours to them being U/F. */
export function rotationFor(top: number, front: number): string | null {
  for (const { alg } of ROTATIONS) {
    const g = applyMoves(solvedFacelets(), alg);
    if (g[CENTERS[U]] === top && g[CENTERS[F]] === front) return alg;
  }
  return null;
}

const AUFS = ['', 'U', 'U2', "U'"].map((a) => parseAlg(a));

export function isSolvedUpToAUF(state: Facelets): boolean {
  const solved = solvedFacelets();
  return AUFS.some((auf) => equalFacelets(applyMoves(state, auf), solved));
}

// Facelets of the first two layers (everything not on the U layer), plus the U center.
const F2L_FACELETS: number[] = [];
for (let i = 0; i < 54; i++) {
  if (POS[i][1] < 1 || i === CENTERS[U]) F2L_FACELETS.push(i);
}
const U_EDGE_TOPS = [1, 3, 5, 7];

export function isF2LSolved(state: Facelets): boolean {
  return F2L_FACELETS.every((i) => state[i] === Math.floor(i / 9));
}

/** ZBLS goal: F2L solved and every last-layer edge oriented (U colour on top). */
export function isZBLSDone(state: Facelets): boolean {
  return isF2LSolved(state) && U_EDGE_TOPS.every((i) => state[i] === U);
}

/** Number of quarter turns a smart cube reports for these moves (rotations are free, slices are two). */
export function quarterTurns(moves: Move[]): number {
  let n = 0;
  for (const m of moves) {
    if ('xyz'.includes(m.base)) continue;
    const q = m.amount === 2 ? 2 : 1;
    n += 'MES'.includes(m.base) ? 2 * q : q;
  }
  return n;
}

export { POS, NORMAL };
