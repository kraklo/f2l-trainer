import { describe, expect, it } from 'vitest';
import { parseAlg, solvedFacelets } from '../cube/cube';
import { ScrambleTracker } from './scramble';

function play(t: ScrambleTracker, alg: string) {
  for (const m of parseAlg(alg)) {
    // the cube only reports quarter turns
    for (let i = 0; i < (m.amount === 2 ? 2 : 1); i++) t.move({ base: m.base, amount: m.amount === 2 ? 1 : m.amount });
  }
}

describe('ScrambleTracker', () => {
  it('completes when the scramble is followed', () => {
    const t = new ScrambleTracker("R U2 F' D", solvedFacelets());
    play(t, "R U2 F' D");
    expect(t.done).toBe(true);
    expect(t.remaining).toBe('');
  });

  it('accepts a half turn done in either direction', () => {
    const t = new ScrambleTracker('R2 U', solvedFacelets());
    t.move({ base: 'R', amount: 3 });
    expect(t.remaining).toBe("R' U");
    t.move({ base: 'R', amount: 3 });
    expect(t.progress).toBe(1);
    play(t, 'U');
    expect(t.done).toBe(true);
  });

  it('shows how to recover from a wrong turn', () => {
    const t = new ScrambleTracker('R U', solvedFacelets());
    play(t, 'R');
    play(t, 'F');
    expect(t.remaining).toBe("F' U");
    play(t, "F'");
    expect(t.remaining).toBe('U');
    play(t, 'U');
    expect(t.done).toBe(true);
  });

  it('describes a fixed-width row: done count, next move, and what to undo', () => {
    const t = new ScrambleTracker("R2 U F'", solvedFacelets());
    expect(t.display).toEqual({ done: 0, next: 'R2', undo: '' });
    t.move({ base: 'R', amount: 1 });
    // half of R2 done: the same cell asks for the other quarter
    expect(t.display).toEqual({ done: 0, next: 'R', undo: '' });
    t.move({ base: 'R', amount: 1 });
    expect(t.display).toEqual({ done: 1, next: 'U', undo: '' });
    t.move({ base: 'F', amount: 1 });
    expect(t.display).toEqual({ done: 1, next: 'U', undo: "F'" });
    t.move({ base: 'F', amount: 3 });
    play(t, "U F'");
    expect(t.display).toEqual({ done: 3, next: null, undo: '' });
  });
});
