// F2L cases and known algorithms.
//
// A pair's case is read with its slot turned to FR: the corner's and edge's position and twist,
// minimised over pre-AUFs (U turns), so the 41 standard cases plus "solved" and "piece in another
// slot" fall out of one signature. Case numbers and algorithms come from SpeedCubeDB
// (src/data/f2l-algs.json); each algorithm's slot and case are found by running it backwards from
// solved, so a mislabelled or mistyped algorithm is simply dropped.

import data from '../data/f2l-algs.json';
import { applyMoves, normalized, parseAlg, setupFor, solvedFacelets, type Facelets } from '../cube/cube';
import { crossSolved, slotSolved, slotsFor, type Slot } from '../cube/pieces';
import { fromFacelets, MOVES, multiply } from './cubie';
import { cornerCoord, edgeCoord } from './tables';
import { viewFrom } from './view';

export const POSITIONS = ['FR', 'FL', 'BL', 'BR'] as const;
export type Position = (typeof POSITIONS)[number];

const D = 3;
/** y turns of the whole cube move a slot one position along POSITIONS (FR → FL → BL → BR). */
export const Y_TURNS = ['', 'y', 'y2', "y'"];
const FACES_OF: Record<Position, [number, number]> = { FR: [2, 1], FL: [2, 4], BL: [5, 4], BR: [5, 1] };

export function positionOf(slot: Slot): Position {
  return POSITIONS.find((p) => FACES_OF[p].every((f) => slot.faces.includes(f)))!;
}

export function slotAt(p: Position): Slot {
  return slotsFor(D).find((s) => positionOf(s) === p)!;
}

/** The view rotation (from POSITIONS) that brings position p to FR. */
export function toFR(p: Position): string {
  return Y_TURNS[(4 - POSITIONS.indexOf(p)) % 4];
}

const U_MOVES = [0, 1, 2].map((a) => MOVES[a]); // U, U2, U'

/** Case signature of the FR pair (cross on D): corner and edge coordinates, minimised over pre-AUF. */
export function pairSignature(f: Facelets): number {
  const c = fromFacelets(f);
  let best = cornerCoord(c) * 24 + edgeCoord(c);
  for (const m of U_MOVES) {
    const u = multiply(c, m);
    best = Math.min(best, cornerCoord(u) * 24 + edgeCoord(u));
  }
  return best;
}

export interface KnownAlg {
  alg: string;
  votes: number;
  /** Standard case number 1-41. */
  case: number;
  /** SpeedCubeDB's case label for it (case is the majority label for its signature). */
  label: number;
  /** Slot the algorithm solves, as written. */
  slot: Position;
  sig: number;
}

/** The case an algorithm solves, from its setup state, or null if it isn't a single-slot F2L alg. */
export function classifyAlg(alg: string): { slot: Position; sig: number } | null {
  let setup: Facelets;
  try {
    setup = applyMoves(solvedFacelets(), setupFor(alg));
  } catch {
    return null;
  }
  if (!crossSolved(setup, D)) return null;
  const unsolved = slotsFor(D).filter((s) => !slotSolved(setup, s));
  if (unsolved.length !== 1) return null;
  const slot = positionOf(unsolved[0]);
  return { slot, sig: pairSignature(viewFrom(setup, toFR(slot)).facelets) };
}

let known: { algs: KnownAlg[]; caseOfSig: Map<number, number> } | null = null;

/** The verified known algorithms and the signature → case number map (built on first use). */
export function knownAlgs() {
  if (known) return known;
  const algs: KnownAlg[] = [];
  const votesBySig = new Map<number, Map<number, number>>();
  for (const row of data as { case: number; alg: string; votes: number }[]) {
    const cls = classifyAlg(row.alg);
    if (!cls) continue;
    algs.push({ alg: row.alg, votes: row.votes, case: row.case, label: row.case, ...cls });
    const tally = votesBySig.get(cls.sig) ?? new Map<number, number>();
    tally.set(row.case, (tally.get(row.case) ?? 0) + 1);
    votesBySig.set(cls.sig, tally);
  }
  // A signature's case number is the label most of its algorithms carry.
  const caseOfSig = new Map<number, number>();
  for (const [sig, tally] of votesBySig) caseOfSig.set(sig, [...tally].sort((a, b) => b[1] - a[1])[0][0]);
  for (const a of algs) a.case = caseOfSig.get(a.sig)!;
  known = { algs, caseOfSig };
  return known;
}

/** Case number (1-41) of the pair at position p of a view, or null (solved, or a piece in another slot). */
export function caseAt(view: Facelets, p: Position): number | null {
  return knownAlgs().caseOfSig.get(pairSignature(viewFrom(view, toFR(p)).facelets)) ?? null;
}

/** Whether `alg` takes `view` to a state with the cross, `target` and every `keep` slot solved. */
export function solvesPair(view: Facelets, alg: string, target: Position, keep: Position[]): boolean {
  let after: Facelets;
  try {
    after = normalized(applyMoves(view, parseAlg(alg)));
  } catch {
    return false;
  }
  return crossSolved(after, D) && [target, ...keep].every((p) => slotSolved(after, slotAt(p)));
}
