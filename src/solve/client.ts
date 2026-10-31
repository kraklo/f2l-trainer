// Main-thread side of the analysis worker.

import { type SolveRecord } from '../record/types';
import { DEFAULT_ANALYSIS_SETTINGS, type Analysis, type AnalysisSettings } from './analyse';
import { type AnalysisRequest } from './worker';

type Reply = { id: number; result?: Analysis | null; error?: string };

export class Analyser {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private next = 0;
  private pending = new Map<number, { resolve: (a: Analysis | null) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.addEventListener('message', (e: MessageEvent<Reply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result ?? null);
    });
  }

  analyse(record: SolveRecord, settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS): Promise<Analysis | null> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, record, settings } satisfies AnalysisRequest);
    });
  }
}
