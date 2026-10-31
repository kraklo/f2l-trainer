// Guides the user through a scramble turn by turn. Wrong turns are absorbed: the remaining alg is
// always "undo what went off track, then the rest of the scramble", simplified.

import { algToString, applyMove, equalFacelets, invertMoves, moveToString, parseAlg, type Facelets, type Move } from '../cube/cube';

export class ScrambleTracker {
  readonly moves: Move[];
  state: Facelets;
  private targets: Facelets[];
  private k = 0;
  private offTrack: Move[] = [];

  constructor(scramble: string, start: Facelets) {
    this.moves = parseAlg(scramble);
    this.state = start;
    this.targets = [start];
    for (const m of this.moves) this.targets.push(applyMove(this.targets[this.targets.length - 1], m));
  }

  get done(): boolean {
    return this.k === this.moves.length && this.offTrack.length === 0;
  }

  /** Number of scramble moves completed. */
  get progress(): number {
    return this.k;
  }

  get target(): Facelets {
    return this.targets[this.targets.length - 1];
  }

  /** Moves still needed to reach the scrambled state. */
  get remaining(): string {
    return algToString(simplify([...invertMoves(this.offTrack), ...this.moves.slice(this.k)]));
  }

  /**
   * What to show for a fixed-width scramble row: how many moves are done, what to turn in the next
   * move's place (the rest of a half turn when one quarter is done), and any wrong turns to undo first.
   */
  get display(): { done: number; next: string | null; undo: string } {
    const next = this.moves[this.k];
    if (!this.offTrack.length) return { done: this.k, next: next ? moveToString(next) : null, undo: '' };
    if (next) {
      const merged = simplify([...invertMoves(this.offTrack), next]);
      if (merged.length === 1 && merged[0].base === next.base) return { done: this.k, next: moveToString(merged[0]), undo: '' };
    }
    return { done: this.k, next: next ? moveToString(next) : null, undo: algToString(simplify(invertMoves(this.offTrack))) };
  }

  move(m: Move) {
    this.state = applyMove(this.state, m);
    if (this.k < this.moves.length && equalFacelets(this.state, this.targets[this.k + 1])) {
      this.k++;
      this.offTrack = [];
    } else if (equalFacelets(this.state, this.targets[this.k])) {
      this.offTrack = [];
    } else {
      this.offTrack = simplify([...this.offTrack, m]);
      // Catch up if the wrong turns happened to land on a later target (e.g. R' R' for R2).
      for (let j = this.k + 1; j < this.targets.length; j++) {
        if (equalFacelets(this.state, this.targets[j])) {
          this.k = j;
          this.offTrack = [];
          break;
        }
      }
    }
  }
}

/** Merges adjacent turns of the same face, dropping those that cancel. */
export function simplify(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.base === m.base) {
      const amount = (last.amount + m.amount) % 4;
      if (amount === 0) out.pop();
      else out[out.length - 1] = { base: m.base, amount };
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
