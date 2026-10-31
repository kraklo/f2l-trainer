// Analysis worker: builds or loads the solver tables once, then analyses solves on request.

import { type SolveRecord } from '../record/types';
import { analyse, type AnalysisSettings } from './analyse';
import { loadTables } from './table-cache';

export interface AnalysisRequest {
  id: number;
  record: SolveRecord;
  settings: AnalysisSettings;
}

const tables = loadTables();
const post = (msg: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);

self.addEventListener('message', async (e: MessageEvent<AnalysisRequest>) => {
  const { id, record, settings } = e.data;
  try {
    post({ id, result: analyse(await tables, record, settings) });
  } catch (err) {
    post({ id, error: String(err) });
  }
});
