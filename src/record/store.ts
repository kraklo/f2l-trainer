// Solve storage in IndexedDB (solves accumulate past localStorage's ~5 MB) plus JSON backup.

import { createStore, del, get, set, setMany, values } from 'idb-keyval';
import { type SolveRecord } from './types';

// idb-keyval keeps one object store per database, so other caches get their own database name.
const solves = createStore('f2l-trainer-solves', 'solves');

export interface Backup {
  app: 'f2l-trainer';
  version: 1;
  exportedAt: string;
  solves: SolveRecord[];
}

export function saveSolve(rec: SolveRecord): Promise<void> {
  return set(rec.id, rec, solves);
}

export function getSolve(id: string): Promise<SolveRecord | undefined> {
  return get<SolveRecord>(id, solves);
}

export function deleteSolve(id: string): Promise<void> {
  return del(id, solves);
}

/** All solves, oldest first. */
export async function listSolves(): Promise<SolveRecord[]> {
  const all = await values<SolveRecord>(solves);
  return all.sort((a, b) => a.startedAt - b.startedAt);
}

export async function exportAll(): Promise<Backup> {
  return { app: 'f2l-trainer', version: 1, exportedAt: new Date().toISOString(), solves: await listSolves() };
}

/** Adds the backup's solves, replacing any with the same id. Returns how many were imported. */
export async function importAll(data: unknown): Promise<number> {
  const b = data as Partial<Backup> | null;
  if (!b || b.app !== 'f2l-trainer' || !Array.isArray(b.solves)) throw new Error('Not an f2l-trainer backup');
  await setMany(b.solves.map((s) => [s.id, s]), solves);
  return b.solves.length;
}
