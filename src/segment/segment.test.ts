import { describe, expect, it } from 'vitest';
import { applyMoves, invertAlg, parseAlg, solvedFacelets } from '../cube/cube';
import { slotName } from '../cube/pieces';
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
