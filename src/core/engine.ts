import { parseInfo } from './engine-score';
import type { EngineLine } from './engine-score';

interface WorkerPort {
  postMessage(text: string): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export class Engine {
  private worker: WorkerPort;
  private stopped = false;
  private busy = false;
  private listener?: (line: string) => void;
  private rejectPending?: (error: Error) => void;

  constructor(worker: WorkerPort) {
    this.worker = worker;
    worker.onmessage = (event) => {
      for (const line of String(event.data).split('\n')) this.listener?.(line.trim());
    };
    worker.onerror = (event) =>
      this.fail(new Error(`Engine failed: ${event.message || 'could not load WASM'}`));
  }

  private fail(error: Error) {
    this.stopped = true;
    this.worker.terminate();
    this.rejectPending?.(error);
  }

  private request<T>(
    commands: string[],
    receive: (line: string, finish: (value: T) => void) => void,
  ): Promise<T> {
    if (this.stopped)
      return Promise.reject(new Error('Analysis cancelled. Start analysis to reload the engine.'));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error('Engine timed out. Retry with Fast analysis.')),
        120_000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        this.listener = undefined;
        this.rejectPending = undefined;
      };
      this.rejectPending = (error) => {
        cleanup();
        reject(error);
      };
      this.listener = (line) => {
        try {
          receive(line, (value) => {
            cleanup();
            resolve(value);
          });
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      for (const command of commands) this.worker.postMessage(command);
    });
  }

  async initialize(): Promise<void> {
    await this.request<void>(['uci'], (line, done) => {
      if (line === 'uciok') done();
    });
    await this.request<void>(
      ['setoption name Hash value 32', 'setoption name UCI_ShowWDL value true', 'isready'],
      (line, done) => {
        if (line === 'readyok') done();
      },
    );
  }

  async search(position: string, depth: number, only?: string): Promise<EngineLine[]> {
    if (this.stopped) throw new Error('Analysis cancelled.');
    if (this.busy) throw new Error('Engine is busy with another search.');
    this.busy = true;
    try {
      await this.request<void>(
        ['setoption name Clear Hash', `setoption name MultiPV value ${only ? 1 : 3}`, 'isready'],
        (line, done) => {
          if (line === 'readyok') done();
        },
      );
      const lines = new Map<number, EngineLine>();
      return await this.request<EngineLine[]>(
        [position, `go depth ${depth}${only ? ` searchmoves ${only}` : ''}`],
        (text, done) => {
          const parsed = parseInfo(text);
          if (parsed) lines.set(parsed.multipv, parsed);
          if (text.startsWith('bestmove ')) {
            const complete = [...lines.values()]
              .filter((l) => l.depth >= depth)
              .sort((a, b) => a.multipv - b.multipv);
            if (!complete.length)
              throw new Error(
                'Engine returned no complete search. Try a different position or reload.',
              );
            done(complete);
          }
        },
      );
    } finally {
      this.busy = false;
    }
  }

  dispose() {
    if (!this.stopped) this.fail(new Error('Analysis cancelled.'));
  }
}

export async function loadEngine(
  signal: AbortSignal,
  status: (text: string) => void,
): Promise<Engine> {
  if (typeof WebAssembly === 'undefined')
    throw new Error('This browser does not support WebAssembly. Use a current browser.');
  status('Loading engine manifest...');
  const response = await fetch(`${import.meta.env.BASE_URL}engine/manifest.json`, { signal });
  if (!response.ok)
    throw new Error(
      `Engine manifest could not load (${response.status}). Check deployment assets.`,
    );
  const manifest: unknown = await response.json();
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('script' in manifest) ||
    typeof manifest.script !== 'string' ||
    !/^stockfish-[\w.-]+\.js$/.test(manifest.script)
  ) {
    throw new Error('Invalid engine manifest.');
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  status('Loading local Stockfish WASM (first load may take a moment)...');
  const engine = new Engine(new Worker(`${import.meta.env.BASE_URL}engine/${manifest.script}`));
  const cancel = () => engine.dispose();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await engine.initialize();
    status('Engine ready. Analyzing positions...');
    return engine;
  } catch (error) {
    engine.dispose();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
