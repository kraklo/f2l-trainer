import { describe, expect, it } from 'vitest';
import {
  applyMoves, invertAlg, isSolvedUpToAUF, isZBLSDone, normalizingRotation, parseAlg,
  quarterTurns, solvedFacelets, toFaceletString,
} from './cube';

const SOLVED = toFaceletString(solvedFacelets());

describe('moves', () => {
  it('has order 4 for every quarter turn', () => {
    for (const m of 'U R F D L B u r f d l b M E S x y z'.split(' ')) {
      expect(toFaceletString(applyMoves(solvedFacelets(), `${m} ${m} ${m} ${m}`))).toBe(SOLVED);
    }
  });

  it('matches known identities', () => {
    const same = (a: string, b: string) =>
      expect(toFaceletString(applyMoves(solvedFacelets(), a))).toBe(toFaceletString(applyMoves(solvedFacelets(), b)));
    same('r', "L x");
    same('M', "L' R x'");
    same('E', "U D' y'");
    same('S', "F' B z");
    same('d', 'U y\'');
    same("x U x'", 'F');
    same("y R y'", 'B');
    same("z U z'", 'L');
    // sexy move has order 6
    same("R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'", '');
  });

  it('R move cycles F face onto U', () => {
    const s = toFaceletString(applyMoves(solvedFacelets(), 'R'));
    // U3, U6, U9 come from the front
    expect([s[2], s[5], s[8]].join('')).toBe('FFF');
    // F3, F6, F9 come from D
    expect([s[20], s[23], s[26]].join('')).toBe('DDD');
  });

  it('T-perm is solved up to AUF and keeps F2L', () => {
    const t = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const state = applyMoves(solvedFacelets(), invertAlg(t));
    expect(isSolvedUpToAUF(applyMoves(state, t))).toBe(true);
    expect(isZBLSDone(state)).toBe(true);
    expect(isSolvedUpToAUF(state)).toBe(false);
  });

  it('normalizes rotations', () => {
    const state = applyMoves(solvedFacelets(), "R U x y2");
    const fixed = applyMoves(state, normalizingRotation(state));
    expect(toFaceletString(applyMoves(fixed, "U' R'"))).toBe(SOLVED);
  });

  it('counts quarter turns like a smart cube reports them', () => {
    expect(quarterTurns(parseAlg("R U2 r' M y"))).toBe(1 + 2 + 1 + 2);
  });
});
