// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applyMoves, equalFacelets, normalized, parseAlg, solvedFacelets } from '../cube/cube';
import { crossSolved, slotName, slotSolved, slotsFor } from '../cube/pieces';
import { analyse } from '../solve/analyse';
import { buildTables } from '../solve/tables';
import { loadExpected, loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { overviewPanel, stepPanel, type StepUi } from './analysis';
import { buildSteps, type Goal, type Playable } from './steps';

// TwistyPlayer needs WebGL; the panels and the step model are tested without it.
vi.mock('../render/cubeview', () => ({ CubeView: class {} }));

const t = buildTables();
const checked = solveFixtureNames.filter((n) => loadExpected(n));

function reaches(p: Playable, goal: Goal): boolean {
  const s = normalized(applyMoves(solvedFacelets(), parseAlg(`${p.setup} ${p.alg}`)));
  if (!crossSolved(s, goal.cross)) return false;
  return !goal.slot || slotSolved(s, slotsFor(goal.cross).find((x) => slotName(x) === goal.slot)!);
}

describe.skipIf(!checked.length).each(checked)('analysis steps for %s', (name) => {
  const record = replayFixture(loadSolveFixture(name));
  const a = analyse(t, record)!;
  const steps = buildSteps(record, a);

  it('walks overview, cross, four pairs and the last layer', () => {
    expect(steps.map((s) => s.key)).toEqual(['overview', 'cross', 'pair-1', 'pair-2', 'pair-3', 'pair-4', 'll']);
  });

  it('plays your moves for each stage from the state it started in', () => {
    for (const s of steps) {
      if (s.goal.kind === 'solve') {
        expect(equalFacelets(normalized(applyMoves(solvedFacelets(), parseAlg(`${s.yours.setup} ${s.yours.alg}`))), solvedFacelets()), s.key).toBe(true);
      } else if (s.goal.kind !== 'none') {
        expect(reaches(s.yours, s.goal), s.key).toBe(true);
      }
    }
  });

  it('only offers options that do what they say, from the same state', () => {
    for (const s of steps) {
      for (const g of s.groups) {
        for (const item of g.items) expect(reaches(item, item.goal), `${s.key} ${g.title}: ${item.setup} | ${item.alg}`).toBe(true);
      }
    }
    expect(steps.find((s) => s.key === 'pair-1')!.groups.length).toBeGreaterThan(0);
  });

  it('renders each panel', () => {
    const ui: StepUi = { selected: null, goTo: () => {}, play: () => {} };
    const overview = overviewPanel(record, a, steps, ui);
    expect(overview.querySelectorAll('.timeline .seg')).toHaveLength(6);
    expect(overview.querySelectorAll('table.stages tbody tr')).toHaveLength(6);
    expect(overview.querySelector('a')!.getAttribute('href')).toMatch(/^https:\/\/alg\.cubing\.net\/\?setup=/);
    for (const s of steps.slice(1)) {
      const panel = stepPanel(s, ui);
      expect(panel.querySelector('.yours code')!.textContent).toBe(s.yours.alg || '—');
      expect(panel.querySelectorAll('ul.options li').length).toBe(s.groups.reduce((n, g) => n + g.items.length, 0));
    }
  });
});
