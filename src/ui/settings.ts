// Settings: what the analysis assumes about how you solve.

import { type App, type View } from '../app';
import { COLOUR_NAMES } from '../cube/pieces';
import { DEFAULT_SETTINGS } from '../settings';
import { clear, h } from './dom';

const WIDES: [string, string][] = [['r', 'r / l'], ['M', 'M'], ['f', 'f / b'], ['S', 'S'], ['d', 'd / u'], ['E', 'E']];
const PARTNER: Record<string, string> = { r: 'l', f: 'b', d: 'u' };

export class SettingsView implements View {
  el = h('section', { class: 'view settings' });

  constructor(private app: App) {}

  private update(fn: () => void) {
    fn();
    this.app.saveSettings();
    this.render();
  }

  render() {
    const s = this.app.settings;
    const a = s.analysis;
    const num = (value: number, set: (v: number) => void, step: number) =>
      h('input', { type: 'number', value: String(value), step: String(step), min: '0', onchange: (e: Event) => this.update(() => set(Number((e.target as HTMLInputElement).value))) });
    const row = (label: string, control: HTMLElement, help?: string) =>
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, label, help ? h('div', { class: 'muted small' }, help) : null), h('div', null, control));
    clear(this.el,
      h('h2', null, 'Analysis'),
      row('Cross colours you use', h('div', { class: 'checks' }, COLOUR_NAMES.map((name, c) => h('label', null,
        h('input', { type: 'checkbox', checked: a.allowedColours.includes(c), onchange: () => this.update(() => {
          a.allowedColours = a.allowedColours.includes(c) ? a.allowedColours.filter((x) => x !== c) : [...a.allowedColours, c].sort();
        }) }), ` ${name}`))), 'A better cross on one of these is flagged.'),
      row('Slice and wide moves you use', h('div', { class: 'checks' }, WIDES.map(([key, label]) => h('label', null,
        h('input', { type: 'checkbox', checked: a.wides.includes(key), onchange: () => this.update(() => {
          const keys = [key, PARTNER[key] ?? ''].join('');
          a.wides = a.wides.includes(key) ? [...a.wides].filter((k) => !keys.includes(k)).join('') : a.wides + keys;
        }) }), ` ${label}`))), 'The cube sees a d as U plus a y rotation; only merge the ones you really do.'),
      row('Pause threshold (ms)', num(a.pauseThresholdMs, (v) => (a.pauseThresholdMs = v), 10), 'Gaps longer than this count as pauses.'),
      row('Front-slot penalty', num(a.frontPenalty, (v) => (a.frontPenalty = v), 0.1), 'Added to inserting into a front slot while back slots are open, to favour look-ahead.'),
      a.personalWeights
        ? row('Move costs', h('div', null, `Yours, fitted from ${a.personalWeights.solves} solves (including the hand-switch cost). `,
          h('button', { class: 'link', onclick: () => this.update(() => (a.personalWeights = null)) }, 'Use defaults')), 'Fit them again from History.')
        : row('Hand-switch cost', num(a.sideSwitch, (v) => (a.sideSwitch = v), 0.1), 'Added when an R turn directly follows an L turn or vice versa. History can fit all move costs to your own speed.'),
      h('h2', null, 'Display'),
      row('Show the cube while solving', h('input', { type: 'checkbox', checked: s.liveCube, onchange: () => this.update(() => (s.liveCube = !s.liveCube)) })),
      h('div', { class: 'controls' }, h('button', { onclick: () => this.update(() => (this.app.settings = { ...structuredClone(DEFAULT_SETTINGS), lookahead: s.lookahead })) }, 'Restore defaults')),
      h('p', { class: 'muted small' }, 'Changes apply to the next analysis you open.'),
    );
  }
}
