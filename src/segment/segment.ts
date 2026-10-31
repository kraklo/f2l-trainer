// Finds the cross colour and when the cross and each F2L slot were finished, on core-frame moves
// (centres fixed, so it needs no orientation data).
//
// The cross colour is the colour whose F2L was completed first. Pair insertions break the cross for a
// few moves (L U L' moves a cross edge out and back), so:
// - the cross is done when it is solved and, until F2L is complete, never broken for more than
//   CROSS_BREAK_MOVES in a row (a real rebuild takes longer);
// - slots are judged only at checkpoints where the cross is intact; a slot is done at the last
//   checkpoint where it became solved and then stayed solved at every later checkpoint. This handles
//   slots broken and rebuilt, and several slots finishing on the same move.

import { applyMove, type Facelets, type Move } from '../cube/cube';
import { crossSolved, slotSolved, slotsFor, type Slot } from '../cube/pieces';

export interface RawSegmentation {
  cross: number;
  /** Index of the move that finished each stage (-1: solved before the first move). */
  crossEnd: number;
  slots: { slot: Slot; end: number }[]; // in finishing order
  f2lEnd: number;
}

const CROSS_BREAK_MOVES = 16;

export function segmentRaw(start: Facelets, moves: Move[]): RawSegmentation | null {
  const states = [start];
  for (const m of moves) states.push(applyMove(states[states.length - 1], m));

  let best: { cross: number; at: number } | null = null;
  for (let c = 0; c < 6; c++) {
    const slots = slotsFor(c);
    const at = states.findIndex((s) => crossSolved(s, c) && slots.every((sl) => slotSolved(s, sl)));
    if (at >= 0 && (!best || at < best.at)) best = { cross: c, at };
  }
  if (!best) return null;
  const { cross, at } = best;
  // State i is reached by move i - 1, so a stage finished at state i ends at move i - 1.

  const crossOk = states.slice(0, at + 1).map((s) => crossSolved(s, cross));
  let crossAt = at;
  for (let i = at; i >= 0; ) {
    if (crossOk[i]) {
      crossAt = i--;
      continue;
    }
    let j = i;
    while (j >= 0 && !crossOk[j]) j--;
    if (i - j > CROSS_BREAK_MOVES || j < 0) break;
    i = j;
  }

  const checkpoints = crossOk.flatMap((ok, i) => (ok && i >= crossAt ? [i] : []));
  const slots = slotsFor(cross).map((slot) => {
    let k = checkpoints.length - 1;
    while (k > 0 && slotSolved(states[checkpoints[k - 1]], slot)) k--;
    return { slot, end: checkpoints[k] - 1 };
  });

  return { cross, crossEnd: crossAt - 1, slots: slots.sort((a, b) => a.end - b.end), f2lEnd: at - 1 };
}
