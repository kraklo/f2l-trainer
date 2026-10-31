// F2L analysis: at each decision point (after the cross and after each pair), every open slot with
// its case, the cheapest solutions found by search, and known algorithms for it in the slot and grip
// it's in (or after a y rotation), against the pair the solver actually chose.

import { algToString, applyMoves, fromFaceletString, parseAlg, toFaceletString, type Facelets } from '../cube/cube';
import { pairName, slotSolved } from '../cube/pieces';
import { type Reconstruction } from '../normalise/normalise';
import { simplify } from '../record/scramble';
import { type SolveRecord } from '../record/types';
import { algCost } from './cost';
import { DEFAULT_PAIR_SEARCH, searchPair, type F2LSolution, type PairSearchOptions } from './f2l';
import { caseAt, knownAlgs, pairSignature, POSITIONS, slotAt, solvesPair, toFR, Y_TURNS, type Position } from './f2lcase';
import { type Tables } from './tables';
import { crossView, viewFrom, type View } from './view';

export interface SlotOption {
  slot: string;
  position: Position;
  case: number | null;
  /** Cheapest solutions found by search (held frame). */
  search: F2LSolution[];
  /** Known algorithms that solve it from here, cheapest first. */
  known: F2LSolution[];
  best: number;
}

export interface DecisionPoint {
  /** Stages done before this decision: 0 = after the cross. */
  after: number;
  /** The cube as held at this point (facelet string, cross on D), which the suggestions start from. */
  state: string;
  /** Original colour (core face id) of each held face, URFDLB. */
  colours: number[];
  options: SlotOption[];
  chosen: { slot: string; alg: string; turns: number; cost: number; option?: SlotOption } | null;
  /** The chosen pair's best cost was more than `cheaperBy` above the cheapest pair's. */
  cheaperSlot: boolean;
  /** Pairs solvable for at most `freeCost`. */
  freePairs: string[];
}

export interface F2LOptions {
  search: PairSearchOptions;
  cheaperBy: number;
  freeCost: number;
  keepKnown: number;
}

export const DEFAULT_F2L_OPTIONS: F2LOptions = { search: DEFAULT_PAIR_SEARCH, cheaperBy: 2, freeCost: 4, keepKnown: 6 };

const AUFS = ['', 'U', 'U2', "U'"];

/** Known algorithms for the pair at `target`, used directly or after a y rotation, with any pre-AUF. */
export function knownSolutions(view: Facelets, target: Position, keep: Position[], openAfter: number, opts = DEFAULT_F2L_OPTIONS): F2LSolution[] {
  const sig = pairSignature(viewFrom(view, toFR(target)).facelets);
  const { algs } = knownAlgs();
  const out = new Map<string, F2LSolution>();
  for (let j = 0; j < 4; j++) {
    // after y^j the target sits here
    const at = POSITIONS[(POSITIONS.indexOf(target) + j) % 4];
    for (const a of algs) {
      if (a.slot !== at || a.sig !== sig) continue;
      for (const auf of AUFS) {
        const alg = algToString(simplify(parseAlg(`${Y_TURNS[j]} ${auf} ${a.alg}`)));
        if (out.has(alg) || !solvesPair(view, alg, target, keep)) continue;
        const moves = parseAlg(alg);
        const rotations = moves.filter((m) => 'xyz'.includes(m.base)).length;
        const endSlot = endPosition(target, alg);
        const penalty = openAfter > 0 && endSlot[0] === 'F' ? opts.search.frontPenalty : 0;
        out.set(alg, { alg, cost: algCost(moves, opts.search.weights) + penalty, turns: moves.length - rotations, rotations, endSlot, penalty, source: 'known', votes: a.votes });
        break;
      }
    }
  }
  return [...out.values()].sort((x, y) => x.cost - y.cost || (y.votes ?? 0) - (x.votes ?? 0));
}

/** Held position of a slot after an alg's net y rotation. */
function endPosition(target: Position, alg: string): Position {
  let turns = 0;
  for (const m of parseAlg(alg)) if (m.base === 'y') turns += m.amount;
  return POSITIONS[(POSITIONS.indexOf(target) + turns) % 4];
}

/** The cube as held at a token index, viewed with the cross on D. */
function heldView(core: Facelets, recon: Reconstruction, lastToken: number): View {
  const alg = [recon.inspection, ...recon.tokens.slice(0, lastToken + 1).map((t) => t.move.base + ['', '', '2', "'"][t.move.amount])].join(' ');
  const held = applyMoves(core, alg);
  const v = viewFrom(held, '');
  if (v.colours[3] === recon.cross) return v;
  // not holding the cross on D: use a grip that does
  const cv = crossView(v.facelets, v.colours.indexOf(recon.cross), 2);
  return { ...cv, colours: cv.colours.map((c) => v.colours[c]) };
}

export function analyseF2L(t: Tables, record: SolveRecord, recon: Reconstruction, opts = DEFAULT_F2L_OPTIONS): DecisionPoint[] {
  const core = fromFaceletString(record.startFacelets);
  const decisions: DecisionPoint[] = [];
  const stages = recon.segments.filter((s) => s.kind !== 'll');
  for (let i = 0; i < stages.length - 1; i++) {
    const v = heldView(core, recon, stages[i].endIdx);
    const open = POSITIONS.filter((p) => !slotSolved(v.facelets, slotAt(p)));
    if (!open.length) continue;
    const done = POSITIONS.filter((p) => !open.includes(p));
    const nameOf = (p: Position) => {
      const [a, b] = slotAt(p).faces;
      return pairName(v.colours[a], v.colours[b]);
    };
    const options: SlotOption[] = open.map((p) => {
      const search = searchPair(t, v.facelets, p, done, open.length - 1, opts.search);
      const known = knownSolutions(v.facelets, p, done, open.length - 1, opts).slice(0, opts.keepKnown);
      const best = Math.min(search[0]?.cost ?? Infinity, known[0]?.cost ?? Infinity);
      return { slot: nameOf(p), position: p, case: caseAt(v.facelets, p), search, known, best };
    });
    options.sort((a, b) => a.best - b.best);

    const next = stages[i + 1];
    const tokens = recon.tokens.slice(next.startIdx, next.endIdx + 1);
    const alg = tokens.map((tk) => tk.move.base + ['', '', '2', "'"][tk.move.amount]).join(' ');
    const option = options.find((o) => o.slot === next.slot);
    decisions.push({
      after: i,
      state: toFaceletString(v.facelets),
      colours: v.colours,
      options,
      chosen: next.slot ? { slot: next.slot, alg, turns: next.turns, cost: algCost(alg, opts.search.weights), option } : null,
      cheaperSlot: !!option && option.best - options[0].best > opts.cheaperBy,
      freePairs: options.filter((o) => o.best <= opts.freeCost).map((o) => o.slot),
    });
  }
  return decisions;
}
