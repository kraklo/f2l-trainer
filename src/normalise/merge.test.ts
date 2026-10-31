import { describe, expect, it } from 'vitest';
import { moveToString, parseAlg } from '../cube/cube';
import { DEFAULT_MERGE, mergeTokens, type Token } from './merge';

/** Tokens from "move@time" pairs; rotations are x/y/z. */
function tokens(spec: string): Token[] {
  return spec.split(' ').map((s, i) => {
    const [mv, t] = s.split('@');
    const move = parseAlg(mv)[0];
    const rotation = 'xyz'.includes(move.base);
    return { move, t: Number(t), tEnd: Number(t), src: rotation ? [] : [i], rotation, frame: 0 };
  });
}

const merged = (spec: string) => mergeTokens(tokens(spec)).tokens.map((t) => moveToString(t.move)).join(' ');

describe('mergeTokens', () => {
  it('turns opposite faces plus a body rotation into a slice', () => {
    expect(merged("R@0 L'@20 x'@60")).toBe('M');
    expect(merged("U@0 x'@100 R@120 L'@140 U@400")).toBe('U M U');
  });

  it('turns one face plus a body rotation into a wide move', () => {
    expect(merged('L@0 x@80')).toBe('r');
  });

  it('only merges into the wide moves the solver uses', () => {
    expect(merged("y'@0 U@50")).toBe("y' U");
    expect(mergeTokens(tokens("y'@0 U@50"), { ...DEFAULT_MERGE, wides: 'd' }).tokens.map((t) => moveToString(t.move))).toEqual(['d']);
  });

  it('leaves rotations far from the turn alone', () => {
    expect(merged('L@0 x@900')).toBe('L x');
  });

  it('joins quick same-direction quarter turns into half turns', () => {
    expect(merged('R@0 R@100 U@200')).toBe('R2 U');
    expect(merged('R@0 R@900')).toBe('R R');
    expect(merged("R@0 R'@100")).toBe("R R'");
  });

  it('cancels rotation flicker', () => {
    expect(merged("U@0 y@300 y'@600 R@900")).toBe('U R');
  });
});
