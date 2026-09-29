/**
 * Minimal typed RPC over postMessage. An API is described as an interface of
 * `method(args) => result`; the client gets typed promises with optional
 * progress callbacks, and the worker side gets a typed handler table.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiShape<A> = { [K in keyof A]: (args: any) => unknown };

export interface Progress {
  done: number;
  total: number;
  label?: string;
}

type RequestMsg = { id: number; method: string; args: unknown };
type ResponseMsg =
  | { id: number; kind: 'result'; result: unknown }
  | { id: number; kind: 'error'; error: string }
  | { id: number; kind: 'progress'; progress: Progress };

export interface HandlerContext {
  progress(p: Progress): void;
  /** Mark buffers in the result to be transferred instead of copied. */
  transfer(...buffers: Transferable[]): void;
}

export type Handlers<A extends ApiShape<A>> = {
  [K in keyof A]: (args: Parameters<A[K]>[0], ctx: HandlerContext) => ReturnType<A[K]> | Promise<ReturnType<A[K]>>;
};

/** Worker side: dispatch incoming requests to handlers, one at a time. */
export function serve<A extends ApiShape<A>>(handlers: Handlers<A>): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  let queue = Promise.resolve();
  scope.onmessage = (ev: MessageEvent<RequestMsg>) => {
    const { id, method, args } = ev.data;
    queue = queue.then(async () => {
      const transfers: Transferable[] = [];
      let lastProgress = 0;
      const ctx: HandlerContext = {
        progress(p) {
          const now = performance.now();
          if (now - lastProgress < 50 && p.done < p.total) return;
          lastProgress = now;
          scope.postMessage({ id, kind: 'progress', progress: p } satisfies ResponseMsg);
        },
        transfer(...b) {
          transfers.push(...b);
        },
      };
      try {
        const handler = handlers[method as keyof A];
        if (!handler) throw new Error(`Unknown method ${method}`);
        const result = await handler(args as never, ctx);
        scope.postMessage({ id, kind: 'result', result } satisfies ResponseMsg, transfers);
      } catch (e) {
        scope.postMessage({ id, kind: 'error', error: e instanceof Error ? e.message : String(e) } satisfies ResponseMsg);
      }
    });
  };
}

interface Pending {
  resolve(v: unknown): void;
  reject(e: Error): void;
  onProgress?: (p: Progress) => void;
}

export class RpcClient<A extends ApiShape<A>> {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly factory: () => Worker) {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const w = this.factory();
    w.onmessage = (ev: MessageEvent<ResponseMsg>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.kind === 'progress') p.onProgress?.(msg.progress);
      else {
        this.pending.delete(msg.id);
        if (msg.kind === 'result') p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      }
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || 'Worker crashed');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    return w;
  }

  call<K extends keyof A & string>(
    method: K,
    args: Parameters<A[K]>[0],
    opts: { onProgress?: (p: Progress) => void; transfer?: Transferable[] } = {},
  ): Promise<Awaited<ReturnType<A[K]>>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts.onProgress });
      this.worker.postMessage({ id, method, args } satisfies RequestMsg, opts.transfer ?? []);
    });
  }

  /** Hard-cancel everything in flight by terminating and respawning the worker. */
  restart(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new CancelledError());
    this.pending.clear();
    this.worker = this.spawn();
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}
