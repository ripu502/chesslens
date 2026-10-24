import { describe, expect, it, vi } from 'vitest';
import { Engine, loadEngine } from './engine';

class FakeWorker {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  sent: string[] = [];
  postMessage(text: string) {
    this.sent.push(text);
    if (text === 'uci') queueMicrotask(() => this.emit('uciok'));
    if (text === 'isready') queueMicrotask(() => this.emit('readyok'));
    if (text.startsWith('go '))
      queueMicrotask(() => {
        this.emit('info depth 10 multipv 1 score cp 30 wdl 300 500 200 nodes 123 pv e2e4 e7e5');
        this.emit('bestmove e2e4');
      });
  }
  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

describe('serialized engine protocol', () => {
  it('initializes, collects complete lines, uses root restrictions and terminates', async () => {
    const worker = new FakeWorker();
    const engine = new Engine(worker);
    await engine.initialize();
    const result = await engine.search('position startpos', 10, 'e2e4');
    expect(result[0].depth).toBe(10);
    expect(worker.sent).toContain('setoption name UCI_ShowWDL value true');
    expect(worker.sent).toContain('go depth 10 searchmoves e2e4');
    engine.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(engine.search('position startpos', 10)).rejects.toThrow(/cancel/i);
  });

  it('rejects overlapping searches and pending requests on cancellation', async () => {
    const worker = new FakeWorker();
    const engine = new Engine(worker);
    await engine.initialize();
    worker.postMessage = () => {};
    const pending = engine.search('position startpos', 10);
    await expect(engine.search('position startpos', 10)).rejects.toThrow(/busy/i);
    engine.dispose();
    await expect(pending).rejects.toThrow(/cancel/i);
  });

  it('surfaces Worker errors and missing search output', async () => {
    const worker = new FakeWorker();
    const engine = new Engine(worker);
    await engine.initialize();
    worker.postMessage = (text) => {
      if (text === 'isready') queueMicrotask(() => worker.emit('readyok'));
      if (text.startsWith('go ')) queueMicrotask(() => worker.emit('bestmove (none)'));
    };
    await expect(engine.search('position startpos', 10)).rejects.toThrow(/complete/i);
    engine.dispose();
    const broken = new FakeWorker();
    const other = new Engine(broken);
    broken.postMessage = () =>
      queueMicrotask(() => broken.onerror?.({ message: 'bad wasm' } as ErrorEvent));
    await expect(other.initialize()).rejects.toThrow(/bad wasm/);
  });

  it('times out unresponsive workers instead of waiting indefinitely', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.postMessage = () => {};
    const engine = new Engine(worker);
    const check = expect(engine.initialize()).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(120_001);
    await check;
    expect(worker.terminate).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('browser engine loading', () => {
  it('loads local assets and reports readiness', async () => {
    const worker = new FakeWorker();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ script: 'stockfish-19-lite-single.js' }),
      })),
    );
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        return worker;
      }),
    );
    const status = vi.fn();
    try {
      const engine = await loadEngine(new AbortController().signal, status);
      expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Engine ready'));
      engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports unsupported WASM, bad HTTP responses, invalid manifests and cancellation', async () => {
    const controller = new AbortController();
    const status = vi.fn();
    vi.stubGlobal('WebAssembly', undefined);
    await expect(loadEngine(controller.signal, status)).rejects.toThrow(/WebAssembly/);
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );
    await expect(loadEngine(controller.signal, status)).rejects.toThrow(/404/);
    for (const manifest of [null, {}, { script: '../evil.js' }, { script: 3 }]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => manifest })),
      );
      await expect(loadEngine(controller.signal, status)).rejects.toThrow(/manifest/);
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ script: 'stockfish-19-lite-single.js' }),
      })),
    );
    controller.abort();
    await expect(loadEngine(controller.signal, status)).rejects.toThrow(/cancel/i);
    vi.unstubAllGlobals();
  });

  it('terminates on cancellation during initialization', async () => {
    const controller = new AbortController();
    const worker = new FakeWorker();
    worker.postMessage = () => queueMicrotask(() => controller.abort());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ script: 'stockfish-19-lite-single.js' }),
      })),
    );
    vi.stubGlobal(
      'Worker',
      vi.fn(function () {
        return worker;
      }),
    );
    try {
      await expect(loadEngine(controller.signal, vi.fn())).rejects.toThrow(/cancel/i);
      expect(worker.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
