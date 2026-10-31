// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { applyMoves, normalized, parseAlg, solvedFacelets } from '../cube/cube';
import { crossSolved, pairName, slotSolved, slotsFor } from '../cube/pieces';
import { analyse } from '../solve/analyse';
import { buildTables } from '../solve/tables';
import { loadExpected, loadSolveFixture, replayFixture, solveFixtureNames } from '../test/fixtures';
import { analysisContent, type AnalysisUi } from './analysis';

// TwistyPlayer needs WebGL; the content is tested through the replay hook instead.
vi.mock('../render/cubeview', () => ({ CubeView: class {} }));

const t = buildTables();
const checked = solveFixtureNames.filter((n) => loadExpected(n));

function stateAfter(setup: string, alg: string) {
  return normalized(applyMoves(solvedFacelets(), parseAlg(`${setup} ${alg}`)));
}

describe.skipIf(!checked.length).each(checked)('analysis screen for %s', (name) => {
  const record = replayFixture(loadSolveFixture(name));
  const a = analyse(t, record)!;
  const replays: { setup: string; alg: string }[] = [];
  const ui: AnalysisUi = {
    expanded: new Set([0, 1, 2, 3, 4]),
    selected: new Map(),
    toggle: () => {},
    select: () => {},
    replay: (_el, setup, alg) => void replays.push({ setup, alg }),
  };
  const content = analysisContent(record, a, ui);
  const root = document.createElement('div');
  root.append(...content);

  it('renders the summary, timeline and every stage with its details', () => {
    expect(root.querySelectorAll('.timeline .seg')).toHaveLength(6);
    expect(root.querySelectorAll('tr.stage')).toHaveLength(6);
    expect(root.querySelectorAll('tr.detail-row')).toHaveLength(5);
    expect(root.querySelectorAll('.options .diagram').length).toBe(4 + 3 + 2 + 1);
    expect(root.querySelector('a')!.getAttribute('href')).toMatch(/^https:\/\/alg\.cubing\.net\/\?setup=/);
  });

  it('replays your stage and the suggestion from the right states', () => {
    expect(replays).toHaveLength(10); // yours + suggestion for the cross and four pairs
    const pairs = a.recon.segments.filter((s) => s.kind === 'pair');
    const done = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const [yours, suggestion] = [replays[2 * i], replays[2 * i + 1]];
      if (i === 0) {
        expect(crossSolved(stateAfter(yours.setup, yours.alg), a.recon.cross)).toBe(true);
        expect(crossSolved(stateAfter(suggestion.setup, suggestion.alg), a.recon.cross)).toBe(true);
        continue;
      }
      const slot = slotsFor(a.recon.cross).find((s) => pairName(s.faces[0], s.faces[1]) === pairs[i - 1].slot)!;
      done.add(pairs[i - 1].slot!);
      for (const r of [yours, suggestion]) {
        const s = stateAfter(r.setup, r.alg);
        expect(crossSolved(s, a.recon.cross) && slotSolved(s, slot), `${r.setup} | ${r.alg}`).toBe(true);
      }
    }
  });
});
