// cubing.js generates scrambles in a module worker and tries several ways to start it. In a Vite
// build only the "esbuild workaround" (a bundled entry chunk) works, so try that first.
import { setSearchDebug } from 'cubing/search';

setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true });
