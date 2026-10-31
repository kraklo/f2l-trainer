// Cheapest ways to solve one F2L pair from a decision point, by human cost rather than move count.
//
// The search runs in a view where the target slot is at FR (so the exact cross+edge and cross+corner
// tables apply), but moves are written in the solver's held frame. A y rotation only changes which
// face a held letter refers to, so rotations are moves with a cost, and the search can find both
// rotationless and rotating solutions. IDA* on cost stays admissible with h = moves × cheapest weight.

import { FACES, type Facelets } from '../cube/cube';
import { DEFAULT_WEIGHTS, moveCost, sideOf, type CostWeights } from './cost';
import { fromFacelets } from './cubie';
import { POSITIONS, toFR, type Position } from './f2lcase';
import { CORNER_SOLVED, cornerCoord, CROSS_SOLVED, crossCoord, EDGE_SOLVED, edgeCoord, N_MOVES, N_PIECE, type Tables } from './tables';
import { viewFrom } from './view';

export interface F2LSolution {
  alg: string;
  /** Human cost, including any look-ahead penalty. */
  cost: number;
  turns: number;
  rotations: number;
  /** Where the pair went in, in the held frame after the solution's rotations. */
  endSlot: Position;
  penalty: number;
  source: 'search' | 'known';
  /** For known algorithms: SpeedCubeDB votes. */
  votes?: number;
}

export interface PairSearchOptions {
  weights: CostWeights;
  /** Added when the pair goes into a front slot while other slots are still open (look-ahead). */
  frontPenalty: number;
  /** Alternatives up to this much costlier than the best are kept. */
  extra: number;
  keep: number;
  maxTurns: number;
  /** Search effort caps per pair: finding the cheapest, then collecting alternatives. */
  maxNodes: number;
  maxAlternativeNodes: number;
}

export const DEFAULT_PAIR_SEARCH: PairSearchOptions = { weights: DEFAULT_WEIGHTS, frontPenalty: 0.3, extra: 1, keep: 6, maxTurns: 12, maxNodes: 3_000_000, maxAlternativeNodes: 400_000 };

// Slot pieces in a view with the cross on D: corner and edge ids, by position.
const SLOT_PIECES: Record<Position, [number, number]> = { FR: [4, 8], FL: [5, 9], BL: [6, 10], BR: [7, 11] };
const OPP = [3, 4, 5, 0, 1, 2];

/** Exact distances for one slot's pair on its own (corner coord × 24 + edge coord), per position. */
let pairTables: Record<Position, Uint8Array> | null = null;
function pairDist(t: Tables): Record<Position, Uint8Array> {
  if (pairTables) return pairTables;
  const out = {} as Record<Position, Uint8Array>;
  for (const p of POSITIONS) {
    const [corner, edge] = SLOT_PIECES[p];
    const dist = new Uint8Array(N_PIECE * N_PIECE).fill(255);
    const start = corner * 3 * N_PIECE + edge * 2;
    dist[start] = 0;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const idx = queue[i], k = (idx / N_PIECE) | 0, e = idx % N_PIECE;
      for (let mv = 0; mv < N_MOVES; mv++) {
        const n = t.cornerMove[k * N_MOVES + mv] * N_PIECE + t.edgeMove[e * N_MOVES + mv];
        if (dist[n] === 255) {
          dist[n] = dist[idx] + 1;
          queue.push(n);
        }
      }
    }
    out[p] = dist;
  }
  return (pairTables = out);
}

// Held face → face of the search view, for each frame offset m (held grip = view · y^m).
// After y the face in front is the one that was on the right, and so on.
const Y1: Record<string, string> = { U: 'U', D: 'D', F: 'R', R: 'B', B: 'L', L: 'F' };
const HELD_TO_VIEW: Record<string, number>[] = [0, 1, 2, 3].map((m) =>
  Object.fromEntries([...FACES].map((f) => {
    let g = f;
    for (let i = 0; i < m; i++) g = Y1[g];
    return [f, FACES.indexOf(g)];
  })));
/** Diagnostics from the last search (nodes in the collecting pass). */
export const searchStats = { nodes: 0, best: 0 };

const ROTATIONS = [{ name: 'y', turns: 1 }, { name: 'y2', turns: 2 }, { name: "y'", turns: 3 }];
const SUFFIX = ['', '2', "'"];

/**
 * Solutions for the pair at `target` of `view` (held frame, cross on D), keeping the cross and the
 * `keep` slots solved. `openAfter` is how many slots stay unsolved after this pair.
 */
export function searchPair(t: Tables, view: Facelets, target: Position, keep: Position[], openAfter: number, opts = DEFAULT_PAIR_SEARCH): F2LSolution[] {
  const k = (4 - POSITIONS.indexOf(target)) % 4; // view · y^k puts the target at FR
  const v = viewFrom(view, toFR(target));
  const c = fromFacelets(v.facelets);
  const pd = pairDist(t);
  // the kept slots, in search-view positions
  const kept = keep.map((p) => POSITIONS[(POSITIONS.indexOf(p) + k) % 4]);
  const keptTables = kept.map((p) => pd[p]);
  const keptStart = kept.map((p) => [cornerCoord(c, SLOT_PIECES[p][0]), edgeCoord(c, SLOT_PIECES[p][1])]);
  const keptSolved = kept.map((p) => SLOT_PIECES[p][0] * 3 * N_PIECE + SLOT_PIECES[p][1] * 2);
  const minW = Math.min(...['U', 'R', 'L', 'F', 'D', 'B'].map((f) => moveCost({ base: f, amount: 1 }, opts.weights)));

  const turnCost = [...FACES].map((f) => [1, 2, 3].map((a) => moveCost({ base: f, amount: a }, opts.weights)));
  const rotCost = ROTATIONS.map((r) => moveCost({ base: 'y', amount: r.turns }, opts.weights));

  const path: string[] = [];
  const nk = kept.length;
  // kept-slot pair coordinates per search depth, so moves don't allocate
  const kc = new Int32Array((opts.maxTurns * 2 + 2) * Math.max(nk, 1));
  keptStart.forEach(([kk, ee], i) => (kc[i] = kk * N_PIECE + ee));
  let nodes = 0, next = Infinity, maxNodes = opts.maxNodes;
  const found: F2LSolution[] = [];
  let collect = false;

  const h = (cr: number, e: number, co: number, at: number) => {
    let d = Math.max(t.crossDist[cr], t.crossEdge[cr * N_PIECE + e], t.crossCorner[cr * N_PIECE + co]);
    for (let i = 0; i < nk; i++) d = Math.max(d, keptTables[i][kc[at + i]]);
    return d * minW;
  };

  // m: frame offset (held grip = search view · y^m); lastFace: last turned search-view face
  const sides = [...FACES].map(sideOf);
  // lastSide: hand of the previous token (see CostWeights.sideSwitch)
  const dfs = (cr: number, e: number, co: number, m: number, g: number, turns: number, rots: number, lastFace: number, lastRot: boolean, lastSide: number, bound: number): boolean => {
    if (++nodes > maxNodes) return true;
    const at = path.length * nk;
    const f = g + h(cr, e, co, at);
    if (f > bound + 1e-9) {
      if (f < next) next = f;
      return false;
    }
    if (cr === CROSS_SOLVED && e === EDGE_SOLVED && co === CORNER_SOLVED) {
      let keptOk = true;
      for (let i = 0; i < nk; i++) if (kc[at + i] !== keptSolved[i]) keptOk = false;
      if (keptOk) {
        const endSlot = POSITIONS[m];
        const penalty = openAfter > 0 && endSlot[0] === 'F' ? opts.frontPenalty : 0;
        if (g + penalty > bound + 1e-9) {
          if (g + penalty < next) next = g + penalty;
          return false;
        }
        found.push({ alg: path.join(' '), cost: g + penalty, turns, rotations: rots, endSlot, penalty, source: 'search' });
        return !collect;
      }
    }
    if (turns >= opts.maxTurns) return false;
    const child = at + nk;
    for (let fi = 0; fi < 6; fi++) {
      const face = FACES[fi];
      const vf = HELD_TO_VIEW[m][face];
      if (vf === lastFace || (lastFace >= 0 && vf === OPP[lastFace] && vf < lastFace)) continue;
      for (let a = 0; a < 3; a++) {
        const mv = vf * 3 + a;
        for (let i = 0; i < nk; i++) {
          const x = kc[at + i], kk = (x / N_PIECE) | 0, ee = x - kk * N_PIECE;
          kc[child + i] = t.cornerMove[kk * N_MOVES + mv] * N_PIECE + t.edgeMove[ee * N_MOVES + mv];
        }
        path.push(face + SUFFIX[a]);
        const side = sides[fi];
        const switchCost = side && lastSide && side !== lastSide ? opts.weights.sideSwitch : 0;
        const stop = dfs(t.crossMove[cr * N_MOVES + mv], t.edgeMove[e * N_MOVES + mv], t.cornerMove[co * N_MOVES + mv], m, g + turnCost[fi][a] + switchCost, turns + 1, rots, vf, false, side, bound);
        path.pop();
        if (stop) return true;
      }
    }
    if (!lastRot) {
      for (let i = 0; i < nk; i++) kc[child + i] = kc[at + i];
      for (let r = 0; r < ROTATIONS.length; r++) {
        path.push(ROTATIONS[r].name);
        const stop = dfs(cr, e, co, (m + ROTATIONS[r].turns) % 4, g + rotCost[r], turns, rots + 1, lastFace, true, 0, bound);
        path.pop();
        if (stop) return true;
      }
    }
    return false;
  };

  const cr0 = crossCoord(c), e0 = edgeCoord(c), co0 = cornerCoord(c);
  const m0 = (4 - k) % 4;
  // IDA* for the cheapest cost...
  let bound = h(cr0, e0, co0, 0);
  while (!found.length && bound < Infinity && nodes <= opts.maxNodes) {
    next = Infinity;
    dfs(cr0, e0, co0, m0, 0, 0, 0, -1, false, 0, bound);
    // Step at least one cost unit: the collecting pass below still finds the cheapest, since it keeps
    // everything within `extra` (≥ 1) of the first solution found.
    if (!found.length) bound = Math.max(next, bound + 1);
  }
  if (!found.length) return [];
  // ...then the solutions within `extra` of it, as far as the alternatives budget goes.
  const best = found[0].cost;
  collect = true;
  nodes = 0;
  maxNodes = opts.maxAlternativeNodes;
  dfs(cr0, e0, co0, m0, 0, 0, 0, -1, false, 0, best + opts.extra);

  searchStats.nodes = nodes;
  searchStats.best = best;
  const unique = new Map<string, F2LSolution>();
  for (const s of found) if (!unique.has(s.alg)) unique.set(s.alg, s);
  return [...unique.values()].sort((a, b) => a.cost - b.cost || a.turns - b.turns).slice(0, opts.keep);
}
