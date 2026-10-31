// History: stored solves, newest first, with backup and restore. Rolling stats come in M6.

import { type App, type View } from '../app';
import { deleteSolve, exportAll, importAll, listSolves } from '../record/store';
import { type SolveRecord } from '../record/types';
import { clear, h, toast } from './dom';

function solveTime(r: SolveRecord): number | undefined {
  const t = r.moves.map((m) => m.cubeTs ?? m.hostTs).filter((x): x is number => x !== null);
  return t.length > 1 ? t[t.length - 1] - t[0] : undefined;
}

export class HistoryView implements View {
  el = h('section', { class: 'view history' });

  constructor(private app: App) {}

  async render() {
    const solves = (await listSolves()).reverse();
    clear(this.el,
      h('div', { class: 'controls' },
        h('button', { onclick: () => this.exportBackup() }, 'Export all'),
        h('button', { onclick: () => this.importBackup() }, 'Import')),
      solves.length
        ? h('table', { class: 'history-table' },
          h('thead', null, h('tr', null, ['When', 'Time', 'Turns', 'Status', ''].map((t) => h('th', null, t)))),
          h('tbody', null, solves.map((s) => h('tr', { class: 'clickable', onclick: () => this.app.openSolve(s) },
            h('td', null, new Date(s.startedAt).toLocaleString()),
            h('td', { class: 'num' }, ((solveTime(s) ?? 0) / 1000).toFixed(2)),
            h('td', { class: 'num' }, String(s.moves.length)),
            h('td', { class: s.status === 'ok' ? 'muted' : 'bad' }, s.status),
            h('td', null, h('button', { class: 'mini', onclick: (e: Event) => this.remove(e, s) }, 'Delete'))))))
        : h('p', { class: 'muted' }, 'No solves yet.'),
    );
  }

  private async remove(e: Event, s: SolveRecord) {
    e.stopPropagation();
    if (!confirm('Delete this solve?')) return;
    await deleteSolve(s.id);
    void this.render();
  }

  private async exportBackup() {
    const blob = new Blob([JSON.stringify(await exportAll())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `f2l-trainer-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private importBackup() {
    const input = h('input', { type: 'file', accept: '.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        toast(`Imported ${await importAll(JSON.parse(await file.text()))} solves`);
        void this.render();
      } catch (err) {
        toast(String(err), 'error');
      }
    });
    input.click();
  }
}
