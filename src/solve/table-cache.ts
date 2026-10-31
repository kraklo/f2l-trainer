// Solver tables, with the pruning tables (≈9 MB, ≈1.5 s to build) cached in IndexedDB.
// The move tables take ≈0.3 s and are rebuilt on each load.

import { createStore, get, set } from 'idb-keyval';
import { buildMoveTables, buildPruningTables, N_CROSS, N_PIECE, type Tables } from './tables';

const store = createStore('f2l-trainer-tables', 'tables');
const KEY = 'cross-v1';

type Pruning = Pick<Tables, 'crossDist' | 'crossEdge' | 'crossCorner'>;

function valid(p: Partial<Pruning> | undefined): p is Pruning {
  return !!p && p.crossDist?.length === N_CROSS && p.crossEdge?.length === N_CROSS * N_PIECE && p.crossCorner?.length === N_CROSS * N_PIECE;
}

export async function loadTables(): Promise<Tables> {
  const moves = buildMoveTables();
  const cached = await get<Pruning>(KEY, store).catch(() => undefined);
  if (valid(cached)) return { ...moves, ...cached };
  const pruning = buildPruningTables(moves);
  await set(KEY, pruning, store).catch(() => undefined); // caching is best effort
  return { ...moves, ...pruning };
}
