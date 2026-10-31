// Cross analysis for a solve: the best crosses on the colour used, on every colour, and the best
// xcross, against what was actually done.

import { fromFaceletString, type Facelets } from '../cube/cube';
import { pairName } from '../cube/pieces';
import { type Reconstruction } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { algCost, DEFAULT_WEIGHTS, type CostWeights } from './cost';
import { coordsOf, crossSolutions, movesToAlg, xcrossSolve } from './cross';
import { type Tables } from './tables';
import { crossView, viewFrom, type View } from './view';

export interface CrossSolution {
  alg: string;
  length: number;
  cost: number;
}

export interface ColourCross {
  colour: number;
  /** Rotation from the scramble grip (white top, green front) to hold this cross on D. */
  rotation: string;
  optimal: number;
  /** Optimal and optimal + 1 solutions, cheapest first. */
  solutions: CrossSolution[];
}

export interface XCross {
  colour: number;
  slot: string;
  /** Rotation from the scramble grip to the grip the solution is written for. */
  rotation: string;
  alg: string;
  length: number;
}

export interface CrossAnalysis {
  /** The cross that was done, with the best options on that colour from the same grip. */
  used: ColourCross & { turns: number; alg: string };
  /** Every colour, best first. */
  colours: ColourCross[];
  bestColour: number;
  /** Best colour among the ones the solver is comfortable with. */
  bestAllowedColour: number;
  xcross: { best: XCross; bestOnUsed: XCross; perColour: XCross[] };
  /** Turns spent on the cross plus the first pair, to compare with the best xcross. */
  crossPlusPairTurns: number;
}

export interface CrossOptions {
  /** Cross colours the solver is comfortable with (core face ids). */
  allowedColours: number[];
  /** Solutions kept per colour. */
  keep: number;
  weights: CostWeights;
}

export const DEFAULT_CROSS_OPTIONS: CrossOptions = { allowedColours: [0, 1, 2, 3, 4, 5], keep: 6, weights: DEFAULT_WEIGHTS };

const Y = ['', 'y', 'y2', "y'"];

function colourCross(t: Tables, view: View, colour: number, opts: CrossOptions): ColourCross {
  const { cross } = coordsOf(view.facelets);
  const solutions = crossSolutions(t, cross)
    .map((moves) => {
      const alg = movesToAlg(moves);
      return { alg, length: moves.length, cost: algCost(alg, opts.weights) };
    })
    .sort((a, b) => a.cost - b.cost || a.length - b.length)
    .slice(0, opts.keep);
  return { colour, rotation: view.rotation, optimal: t.crossDist[cross], solutions };
}

/** Best xcross over the four slots of a cross view (each slot searched as FR after y turns). */
function bestXcross(t: Tables, core: Facelets, view: View, colour: number): XCross {
  let best: XCross | null = null;
  for (const y of Y) {
    const v = viewFrom(core, `${view.rotation} ${y}`.trim());
    const { cross, edge, corner } = coordsOf(v.facelets);
    const res = xcrossSolve(t, cross, edge, corner, best ? best.length : 14);
    if (!res || (best && res.moves.length >= best.length)) continue;
    best = { colour, slot: pairName(v.colours[2], v.colours[1]), rotation: v.rotation, alg: movesToAlg(res.moves), length: res.moves.length };
  }
  return best!;
}

export function analyseCross(t: Tables, record: SolveRecord, recon: Reconstruction, opts = DEFAULT_CROSS_OPTIONS): CrossAnalysis {
  const core = fromFaceletString(record.startFacelets);
  // The grip the solver actually started in, if it has the cross on D.
  let usedView = viewFrom(core, recon.inspection);
  if (usedView.colours[3] !== recon.cross) usedView = crossView(core, recon.cross, usedView.colours[2]);
  const front = usedView.colours[2];

  const colours = [0, 1, 2, 3, 4, 5].map((c) => (c === recon.cross ? colourCross(t, usedView, c, opts) : colourCross(t, crossView(core, c, front), c, opts)));
  const rank = (a: ColourCross, b: ColourCross) => a.optimal - b.optimal || (a.solutions[0]?.cost ?? 0) - (b.solutions[0]?.cost ?? 0);
  const sorted = colours.slice().sort(rank);
  const allowed = sorted.filter((c) => opts.allowedColours.includes(c.colour));

  const perColour = colours.map((c) => bestXcross(t, core, c.colour === recon.cross ? usedView : crossView(core, c.colour, front), c.colour));
  const crossSeg = recon.segments[0];
  const firstPair = recon.segments[1];
  const tokenAlg = (from: number, to: number) => recon.tokens.slice(from, to + 1).map((tk) => tk.move.base + ['', '', '2', "'"][tk.move.amount]).join(' ');

  return {
    used: { ...colours[recon.cross], turns: crossSeg.turns, alg: tokenAlg(crossSeg.startIdx, crossSeg.endIdx) },
    colours: sorted,
    bestColour: sorted[0].colour,
    bestAllowedColour: (allowed[0] ?? sorted[0]).colour,
    xcross: {
      best: perColour.reduce((a, b) => (b.length < a.length ? b : a)),
      bestOnUsed: perColour[recon.cross],
      perColour: perColour.slice().sort((a, b) => a.length - b.length),
    },
    crossPlusPairTurns: crossSeg.turns + (firstPair?.turns ?? 0),
  };
}
