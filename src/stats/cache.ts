// Summaries cached in IndexedDB, keyed by solve and by the analysis settings that produced them.

import { createStore, get, set } from 'idb-keyval';
import { type SolveRecord } from '../record/types';
import { type AnalysisSettings } from '../solve/analyse';
import { type Analyser } from '../solve/client';
import { summarise, SUMMARY_VERSION, type SolveSummary } from './summary';

const store = createStore('f2l-trainer-summaries', 'summaries');

function keyOf(id: string, settings: AnalysisSettings): string {
  return `${SUMMARY_VERSION}:${id}:${JSON.stringify(settings)}`;
}

/** Summaries for `records` (in order), analysing the ones not cached yet. */
export async function summaries(records: SolveRecord[], settings: AnalysisSettings, analyser: Analyser, progress?: (done: number) => void): Promise<SolveSummary[]> {
  const out: SolveSummary[] = [];
  for (const r of records) {
    const key = keyOf(r.id, settings);
    let s = await get<SolveSummary>(key, store).catch(() => undefined);
    if (!s) {
      const a = await analyser.analyse(r, settings).catch(() => null);
      if (a) {
        s = summarise(r, a);
        await set(key, s, store).catch(() => undefined);
      }
    }
    if (s) out.push(s);
    progress?.(out.length);
  }
  return out;
}
