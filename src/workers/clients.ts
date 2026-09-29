import { RpcClient } from './rpc';
import type { DataApi, ScanApi } from './api';

export const dataWorker = new RpcClient<DataApi>(
  () => new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module', name: 'keno-data' }),
);

export const scanWorker = new RpcClient<ScanApi>(
  () => new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module', name: 'keno-scan' }),
);
