// The analysis as a sequence of steps to walk through: an overview, the cross, each pair and the
// last layer. Each step has what you did and groups of options, all playable from the right state.

import { moveToString } from '../cube/cube';
import { COLOUR_NAMES } from '../cube/pieces';
import { type StageSegment } from '../normalise/normalise';
import { type SolveRecord } from '../record/types';
import { type Analysis } from '../solve/analyse';
import { type DecisionPoint } from '../solve/analyse-f2l';
import { type Position } from '../solve/f2lcase';

/** Moves to play, from the state `setup` reaches. */
export interface Playable {
  setup: string;
  alg: string;
}

/** What a sequence achieves: this colour's cross, plus a pair when given. */
export interface Goal {
  cross: number;
  slot?: string;
}

export interface OptionItem extends Playable {
  id: string;
  goal: Goal;
  label?: string;
  cost?: number;
  note?: string;
  /** For other pairs: draw the pair as it stood at the decision point. */
  diagram?: { decision: DecisionPoint; position: Position };
}

export interface OptionGroup {
  title: string;
  items: OptionItem[];
}

export interface Step {
  key: string;
  title: string;
  segment?: StageSegment;
  yours: Playable & { turns: number; ms: number; lookMs: number; cost?: number; best?: number };
  groups: OptionGroup[];
  flags: string[];
  /** What every option on this step must achieve (used by the tests). */
  goal: { kind: 'cross' | 'pair' | 'solve' | 'none'; cross: number; slot?: string };
}

const colour = (c: number) => COLOUR_NAMES[c];
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

function tokenAlg(a: Analysis, from: number, to: number): string {
  return a.recon.tokens.slice(from, to + 1).map((t) => moveToString(t.move)).join(' ');
}

/** The full reconstruction, inspection rotation included. */
export function solveAlg(a: Analysis): string {
  return join(a.recon.inspection, tokenAlg(a, 0, a.recon.tokens.length - 1));
}

function crossStep(record: SolveRecord, a: Analysis): Step {
  const seg = a.recon.segments[0];
  const c = a.cross;
  const fromGrip = (rotation: string) => join(record.scramble, rotation);
  const allowed = c.colours.find((x) => x.colour === c.bestAllowedColour);
  const flags: string[] = [];
  if (allowed && allowed.colour !== c.used.colour && allowed.optimal < c.used.optimal) {
    flags.push(`${colour(allowed.colour)} had a ${allowed.optimal}-move cross (yours was ${c.used.optimal} at best).`);
  }
  if (c.used.turns > c.used.optimal) flags.push(`Your cross took ${c.used.turns} moves; ${c.used.optimal} was possible.`);
  const xc = (x: typeof c.xcross.best, id: string) => ({
    id, goal: { cross: x.colour, slot: x.slot }, setup: fromGrip(x.rotation), alg: x.alg, label: `${colour(x.colour)} cross + ${x.slot}`, note: `${x.length} moves${x.rotation ? `, after ${x.rotation}` : ''}`,
  });
  return {
    key: 'cross',
    title: 'Cross',
    segment: seg,
    yours: { setup: join(record.scramble, a.recon.inspection), alg: c.used.alg, turns: seg.turns, ms: seg.durationMs, lookMs: 0 },
    groups: [
      { title: `Easiest optimal crosses on ${colour(c.used.colour)}`, items: c.used.solutions.map((s, i) => ({ id: `cross-${i}`, goal: { cross: c.used.colour }, setup: fromGrip(c.used.rotation), alg: s.alg, cost: s.cost, note: `${s.length} moves` })) },
      {
        title: 'Other colours',
        items: c.colours.filter((x) => x.colour !== c.used.colour && x.solutions.length).map((x) => ({
          id: `colour-${x.colour}`, goal: { cross: x.colour }, setup: fromGrip(x.rotation), alg: x.solutions[0].alg, label: colour(x.colour), cost: x.solutions[0].cost,
          note: `${x.optimal} moves${x.rotation ? `, after ${x.rotation}` : ''}`,
        })),
      },
      { title: 'Xcross', items: [xc(c.xcross.best, 'xcross-best'), ...(c.xcross.bestOnUsed.colour !== c.xcross.best.colour || c.xcross.bestOnUsed.alg !== c.xcross.best.alg ? [xc(c.xcross.bestOnUsed, 'xcross-used')] : [])] },
    ],
    flags,
    goal: { kind: 'cross', cross: c.used.colour },
  };
}

function pairStep(record: SolveRecord, a: Analysis, i: number): Step {
  const seg = a.recon.segments[i];
  const setup = join(record.scramble, a.recon.inspection, tokenAlg(a, 0, seg.startIdx - 1));
  const d = a.f2l.find((x) => x.after === i - 1);
  const option = d?.chosen?.option;
  const yours = { setup, alg: tokenAlg(a, seg.startIdx, seg.endIdx), turns: seg.turns, ms: seg.durationMs, lookMs: seg.recognitionMs, cost: d?.chosen?.cost, best: option?.best };
  const step: Step = { key: `pair-${i}`, title: `Pair ${i}`, segment: seg, yours, groups: [], flags: [], goal: { kind: 'pair', cross: a.recon.cross, slot: seg.slot } };
  if (!seg.turns) {
    step.flags.push('This pair was finished together with the previous stage.');
    step.goal.kind = 'none';
    return step;
  }
  if (!d || !option) return step;
  const sols = [...option.search, ...option.known].sort((x, y) => x.cost - y.cost);
  step.groups.push({
    title: `Other ways to do ${option.slot}${option.case ? ` (F2L ${option.case})` : ''}`,
    items: sols.map((s, k) => ({
      id: `pair-${k}`, goal: { cross: a.recon.cross, slot: option.slot }, setup, alg: s.alg, cost: s.cost,
      note: [s.source === 'known' ? `known alg, ${s.votes ?? 0} votes` : '', s.penalty ? 'front slot' : ''].filter(Boolean).join(', '),
    })),
  });
  const others = d.options.filter((o) => o !== option);
  if (others.length) {
    step.groups.push({
      title: 'Other pairs you could have done',
      items: others.map((o) => {
        const best = [...o.search, ...o.known].sort((x, y) => x.cost - y.cost)[0];
        return {
          id: `other-${o.slot}`, goal: { cross: a.recon.cross, slot: o.slot }, setup, alg: best?.alg ?? '', label: `${o.slot} (${o.position})`, cost: o.best,
          note: o.case ? `F2L ${o.case}` : 'a piece is in another slot', diagram: { decision: d, position: o.position },
        };
      }),
    });
  }
  if (d.cheaperSlot) step.flags.push(`${d.options[0].slot} was ${(option.best - d.options[0].best).toFixed(1)} cheaper than the pair you chose.`);
  if (d.chosen && option.best < d.chosen.cost - 0.05) step.flags.push(`Your ${option.slot} cost ${d.chosen.cost.toFixed(1)}; ${option.best.toFixed(1)} was possible.`);
  return step;
}

export function buildSteps(record: SolveRecord, a: Analysis): Step[] {
  const segs = a.recon.segments;
  const total = segs.reduce((s, x) => s + x.durationMs, 0);
  const turns = a.recon.tokens.filter((t) => !t.rotation).length;
  const ll = segs[segs.length - 1];
  return [
    {
      key: 'overview', title: 'Overview',
      yours: { setup: record.scramble, alg: solveAlg(a), turns, ms: total, lookMs: 0 },
      groups: [], flags: [], goal: { kind: 'solve', cross: a.recon.cross },
    },
    crossStep(record, a),
    ...segs.flatMap((s, i) => (s.kind === 'pair' ? [pairStep(record, a, i)] : [])),
    {
      key: 'll', title: 'Last layer', segment: ll,
      yours: { setup: join(record.scramble, a.recon.inspection, tokenAlg(a, 0, ll.startIdx - 1)), alg: tokenAlg(a, ll.startIdx, ll.endIdx), turns: ll.turns, ms: ll.durationMs, lookMs: ll.recognitionMs },
      groups: [], flags: ['The last layer is recorded but not analysed yet.'], goal: { kind: 'solve', cross: a.recon.cross },
    },
  ];
}
