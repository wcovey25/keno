/// <reference lib="webworker" />
/**
 * Scan worker — stateless combination scanner. Runs in its own thread so a
 * long scan never delays range/tab updates, and can be cancelled instantly by
 * terminating the worker.
 */
import { serve } from './rpc';
import type { ScanApi } from './api';
import { scanCombos } from '../core/scanner';

serve<ScanApi>({
  scan({ drawn, params }, ctx) {
    return scanCombos(drawn, params, (p) => ctx.progress({ done: p.scanned, total: p.total, label: 'Scanning combinations' }));
  },
});
