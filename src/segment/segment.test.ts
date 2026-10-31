import { describe, expect, it } from 'vitest';
import { applyMoves, equalFacelets, invertAlg, normalized, parseAlg, solvedFacelets } from '../cube/cube';
import { pairName, slotName } from '../cube/pieces';
import { segmentRaw } from './segment';

// A scrambled last layer, so only the yellow (D) F2L is complete once the slots are solved.
const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

/** Segments `solution` from the state it solves (F2L, with the T-perm last layer). */
function segment(solution: string) {
  const start = applyMoves(applyMoves(solvedFacelets(), TPERM), invertAlg(solution));
  return segmentRaw(start, parseAlg(solution))!;
}

const endOf = (s: ReturnType<typeof segment>, name: string) => s.slots.find((x) => slotName(x.slot) === name)!.end;

describe('segmentRaw', () => {
  it('finds a single slot', () => {
    const s = segment("R U' R'");
    expect(s.cross).toBe(3);
    expect(s.crossEnd).toBe(-1);
    expect(s.f2lEnd).toBe(2);
    expect(endOf(s, 'red-green')).toBe(2);
  });

  it('ignores the cross breaking during insertions', () => {
    const s = segment("R U' R' L' U L");
    expect(s.crossEnd).toBe(-1);
    expect(s.slots.map((x) => x.end)).toEqual([-1, -1, 2, 5]);
  });

  it('counts a slot broken and rebuilt from its last rebuild', () => {
    // red-green solved by move 2, broken by R U R' (3-5), rebuilt by R U' R' (6-8), then a left slot
    const s = segment("R U' R' R U R' R U' R' L' U L");
    expect(endOf(s, 'red-green')).toBe(8);
    expect(s.f2lEnd).toBe(11);
  });

  it('finishes slots together, and with the cross, when one move solves them', () => {
    // R2 breaks the cross and both right slots; the left slots were solved all along, so all four
    // count from the move that completes the cross (an xxxxcross)
    const s = segment('R2');
    expect(s.crossEnd).toBe(0);
    expect(s.slots.map((x) => x.end)).toEqual([0, 0, 0, 0]);
  });
});

/** Turns held-frame moves (with rotations, wides and slices) into the cube's own face turns. */
function coreMoves(alg: string, start: ReturnType<typeof solvedFacelets>) {
  const faces = parseAlg("U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'");
  const out: ReturnType<typeof parseAlg> = [];
  let held = start;
  for (const m of parseAlg(alg)) {
    const before = normalized(held);
    held = applyMoves(held, [m]);
    const after = normalized(held);
    if (equalFacelets(before, after)) continue; // a rotation
    const one = faces.find((f) => equalFacelets(applyMoves(before, [f]), after));
    if (one) {
      out.push(one);
      continue;
    }
    const two = faces.flatMap((a) => faces.map((b) => [a, b])).find(([a, b]) => equalFacelets(applyMoves(before, [a, b]), after));
    if (!two) throw new Error(`no core equivalent for ${m.base}`);
    out.push(...two);
  }
  return out;
}

describe('a slot disturbed by another pair', () => {
  it('keeps its own finish, and the other pair runs to the restore (recorded solve)', () => {
    // A real solve: orange-blue went in first; the red-blue alg later broke it and restored it.
    const scramble = "D B2 U2 B D2 R2 D2 R2 U2 F U2 L2 D B' R' U2 B2 D' L R";
    const solve = "x l' L F' D2 F U' R U' R' U2 L' U' L U2 U2 L U' L' U' y' L U' L' U2 U2 R U2 R2 U' R2 U' R' U' L' U2 L U U L' U L";
    const start = applyMoves(solvedFacelets(), scramble);
    const s = segmentRaw(start, coreMoves(solve, start))!;
    expect(s.cross).toBe(0); // white
    expect(s.slots.map((x) => slotName(x.slot))).toEqual([pairName(4, 5), pairName(1, 2), pairName(1, 5), pairName(2, 4)]);
    // cross R' L B' U2 B (core moves 0-4); orange-blue by move 12 (U' R U' R' U2 L' U' L);
    // red-green by 21; red-blue by 30, including the U' R' that restores orange-blue; green-orange by 39
    expect(s.crossEnd).toBe(4);
    expect(s.slots.map((x) => x.end)).toEqual([12, 21, 30, 39]);
  });
});
