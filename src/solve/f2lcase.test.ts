import { describe, expect, it } from 'vitest';
import { applyMoves, setupFor, solvedFacelets } from '../cube/cube';
import { caseAt, classifyAlg, knownAlgs, POSITIONS } from './f2lcase';

// The first ZBLS alg for each standard F2L case number, from zb-trainer's sheet (FR slot).
const ZBLS_REFERENCE: [number, string][] = [
  [1, "U R U' R'"], [2, "y U' L' U L"], [3, "y L' U' L"], [4, "R U R'"], [5, "U' R U R' U2 R U' R'"],
  [6, "y F2 R U R' U' F2"], [7, "U' R U2 R' U2 R U' R'"], [8, "y' U R' U2 R U2 R' U R"], [9, "y' U2 R' U R U R' U' R"],
  [10, "U' R U R' U R U R'"], [11, "y' R U2 R2 U' R2 U' R'"], [12, "R U' R' U R U' R' U2 R U' R'"], [13, "U y' R' U R U' R' U' R"],
  [14, "U' R U' R' U R U R'"], [15, "R' D' R U' R' D R U R U' R'"], [16, "r U r' U r U2 r' U' r U' r'"], [17, "R U2 R' U' R U R'"],
  [18, "y' R' U2 R U R' U' R"], [19, "U R U2 R' U R U' R'"], [20, "y' U' R' U2 R U' R' U R y"], [21, "U2 R U R' U R U' R'"],
  [22, "y' R' U R U2 R' U' R y"], [23, "U2 R2 U2 R' U' R U' R2"], [24, "U' R U R2 F R F' R U' R'"], [25, "R' F' R U R U' R' F"],
  [26, "L E' L' U L E L'"], [27, "R U' R' U R U' R'"], [28, "y' R' U R U' R' U R y"], [29, "y' R' U' R U R' U' R"],
  [30, "R U R' U' R U R'"], [31, "R U' R' U y' R' U R y"], [32, "U R U' R' U R U' R' U R U' R'"], [33, "U' R U' R' U2 R U' R'"],
  [34, "U R' D' R U' R' D R"], [35, "R' D' r U' r' D F R F'"], [36, "U F' U' F U' R U R'"], [37, "U' R' F R F' R U' R' U R U' R' U2 R U' R'"],
  [38, "R2 U2 R' U' R U' R' U2 R'"], [39, "R U2 R' U R U' R' U R U R'"], [40, "U R U' R' F R U R' U' F' R U' R'"], [41, "U' R U R' F U R U' R' F' R U R'"],
];

describe('known F2L algorithms', () => {
  const { algs, caseOfSig } = knownAlgs();

  it('keeps most of the SpeedCubeDB set and covers all 41 cases in every slot', () => {
    expect(algs.length).toBe(622);
    expect(new Set(caseOfSig.values()).size).toBe(41);
    for (const p of POSITIONS) expect(new Set(algs.filter((a) => a.slot === p).map((a) => a.case)).size).toBe(41);
  });

  it("numbers cases the same way as zb-trainer's ZBLS sheet", () => {
    for (const [n, alg] of ZBLS_REFERENCE) {
      const setup = applyMoves(solvedFacelets(), setupFor(alg));
      const slot = classifyAlg(alg)?.slot ?? POSITIONS.find((p) => caseAt(setup, p) !== null)!;
      expect(caseAt(setup, slot), alg).toBe(n);
    }
  });

  it('agrees with every SpeedCubeDB case label', () => {
    expect(algs.filter((a) => a.case !== a.label)).toEqual([]);
  });
});
