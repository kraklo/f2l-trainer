// Merges held-frame tokens into the moves a solver actually makes. A smart cube only sees outer face
// turns relative to its core, so an M turn arrives as R L' plus a body rotation x' from the gyro, and
// r arrives as L plus x. Half turns arrive as two quarter turns.

import { applyMoves, equalFacelets, moveToString, solvedFacelets, type Move } from '../cube/cube';

export interface Token {
  move: Move;
  /** Start and end time (fitted host clock, ms). */
  t: number;
  tEnd: number;
  /** Indexes of the raw moves this token came from (empty for rotations). */
  src: number[];
  rotation: boolean;
  /** Orientation index in force for this token (after it, for rotations). */
  frame: number;
}

export interface MergeOptions {
  /** A rotation within this many ms of turns on its axis may combine with them into a slice/wide move. */
  sliceWindowMs: number;
  /** Two same-direction quarter turns of one face within this gap become a half turn. */
  halfTurnGapMs: number;
  /**
   * Slice and wide moves the solver uses. A turn plus a rotation on the same axis is only merged into
   * one of these. y-axis ones (d, u, E) are off by default: "U + y regrip" is far more common in F2L
   * than a real d, and the two look the same to the cube at 10 Hz gyro.
   */
  wides: string;
}

export const DEFAULT_MERGE: MergeOptions = { sliceWindowMs: 250, halfTurnGapMs: 300, wides: 'rlfbMS' };

const AXIS_FACES: Record<string, [string, string]> = { x: ['R', 'L'], y: ['U', 'D'], z: ['F', 'B'] };

/** "<face turns sorted>|<rotation>" → the slice or wide quarter turn they make up. */
const COMBOS: Map<string, Move> = (() => {
  const map = new Map<string, Move>();
  const axisOf: Record<string, string> = { r: 'x', l: 'x', M: 'x', u: 'y', d: 'y', E: 'y', f: 'z', b: 'z', S: 'z' };
  for (const [base, axis] of Object.entries(axisOf)) {
    const [f1, f2] = AXIS_FACES[axis];
    for (const amount of [1, 3]) {
      const target = applyMoves(solvedFacelets(), [{ base, amount }]);
      for (const a of [0, 1, 3]) {
        for (const b of [0, 1, 3]) {
          for (const r of [1, 2, 3]) {
            const turns = [{ base: f1, amount: a }, { base: f2, amount: b }].filter((m) => m.amount);
            if (!turns.length) continue;
            if (equalFacelets(applyMoves(solvedFacelets(), [...turns, { base: axis, amount: r }]), target)) {
              map.set(comboKey(turns, { base: axis, amount: r }), { base, amount });
            }
          }
        }
      }
    }
  }
  return map;
})();

function comboKey(turns: Move[], rotation: Move): string {
  return turns.map(moveToString).sort().join(' ') + '|' + moveToString(rotation);
}

/** Combines rotations with nearby turns on the same axis into slice and wide moves. */
function mergeSlices(tokens: Token[], opts: MergeOptions): { tokens: Token[]; merged: number } {
  const out = tokens.slice();
  let merged = 0;
  for (let i = 0; i < out.length; i++) {
    const rot = out[i];
    if (!rot.rotation || rot.move.amount === 2) continue;
    const faces = AXIS_FACES[rot.move.base];
    const near = (k: number) => {
      const tok = out[k];
      return tok && !tok.rotation && faces.includes(tok.move.base) && tok.move.amount !== 2 && Math.abs(tok.t - rot.t) <= opts.sliceWindowMs ? k : -1;
    };
    // Turns on the rotation's axis commute with it, so neighbours on either side are candidates.
    const b1 = near(i - 1), b2 = b1 >= 0 ? near(i - 2) : -1, a1 = near(i + 1), a2 = a1 >= 0 ? near(i + 2) : -1;
    const groups = [[b1, a1], [b2, b1], [a1, a2], [b1], [a1]].filter((g) => g.every((k) => k >= 0));
    for (const g of groups) {
      // two turns of the same face aren't a slice
      if (g.length === 2 && out[g[0]].move.base === out[g[1]].move.base) continue;
      const combo = COMBOS.get(comboKey(g.map((k) => out[k].move), rot.move));
      if (!combo || !opts.wides.includes(combo.base)) continue;
      const parts = [...g.map((k) => out[k]), rot];
      const first = Math.min(...g, i);
      const token: Token = {
        move: combo,
        t: Math.min(...parts.map((p) => p.t)),
        tEnd: Math.max(...parts.map((p) => p.tEnd)),
        src: parts.flatMap((p) => p.src).sort((x, y) => x - y),
        rotation: false,
        frame: rot.frame,
      };
      const remove = new Set([...g, i]);
      const rebuilt = out.filter((_, k) => !remove.has(k));
      rebuilt.splice(first, 0, token);
      out.splice(0, out.length, ...rebuilt);
      merged++;
      i = first;
      break;
    }
  }
  return { tokens: out, merged };
}

/** Joins R R into R2 (and r r, M M, y y); cancels rotation pairs like y y'. */
function mergeHalves(tokens: Token[], opts: MergeOptions): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const prev = out[out.length - 1];
    if (prev && prev.rotation === tok.rotation && prev.move.base === tok.move.base) {
      if (tok.rotation) {
        const amount = (prev.move.amount + tok.move.amount) % 4;
        if (amount === 0) out.pop();
        else out[out.length - 1] = { ...prev, move: { base: tok.move.base, amount }, tEnd: tok.tEnd, frame: tok.frame };
        continue;
      }
      if (prev.move.amount === tok.move.amount && prev.move.amount !== 2 && tok.t - prev.tEnd <= opts.halfTurnGapMs) {
        out[out.length - 1] = { ...prev, move: { base: tok.move.base, amount: 2 }, tEnd: tok.tEnd, src: [...prev.src, ...tok.src] };
        continue;
      }
    }
    out.push(tok);
  }
  return out;
}

export function mergeTokens(tokens: Token[], opts = DEFAULT_MERGE): { tokens: Token[]; merged: number } {
  const { tokens: sliced, merged } = mergeSlices(tokens, opts);
  return { tokens: mergeHalves(sliced, opts), merged };
}
