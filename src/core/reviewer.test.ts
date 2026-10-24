import { describe, expect, it, vi } from 'vitest';
import { reviewGame } from './reviewer';
import { importGame } from './game';
import type { EngineLine } from './analysis';

const engineLine = (pv: string[]): EngineLine => ({
  depth: 14,
  nodes: 100,
  multipv: 1,
  score: { kind: 'cp', value: 0 },
  wdl: [100, 800, 100],
  pv,
});

describe('review scheduling', () => {
  it('prioritizes selected moves, then remaining moves, reusing compatible results', async () => {
    const game = importGame('1. e4 e5 *');
    const results: number[] = [];
    const values = new Map<string, unknown>();
    const read = async (key: string) => values.get(key);
    const write = async (key: string, value: unknown) => {
      values.set(key, value);
    };
    const search = vi.fn(async (position: string) => [
      engineLine([position.includes('moves') ? 'e7e5' : 'e2e4']),
    ]);
    const options = {
      game,
      depth: 10,
      selected: () => 1,
      search,
      signal: new AbortController().signal,
      onResult: (index: number) => {
        results.push(index);
      },
      onWarning: vi.fn(),
      cache: { read, write },
    };
    await reviewGame(options);
    expect(results).toEqual([1, 0]);
    expect(search).toHaveBeenCalledTimes(2);
    await reviewGame(options);
    expect(search).toHaveBeenCalledTimes(2);
  });
  it('reports cache failure once and continues explicitly in memory', async () => {
    const onWarning = vi.fn();
    const game = importGame('1. e4 *');
    await reviewGame({
      game,
      depth: 10,
      selected: () => 0,
      signal: new AbortController().signal,
      search: async () => [engineLine(['e2e4'])],
      onResult: vi.fn(),
      onWarning,
      cache: {
        read: async () => {
          throw new Error('blocked');
        },
        write: vi.fn(),
      },
    });
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('blocked'));
  });
  it('rejects corrupt cache and stops before publishing cancelled output', async () => {
    const controller = new AbortController();
    const onResult = vi.fn();
    await expect(
      reviewGame({
        game: importGame('1. e4 *'),
        depth: 10,
        selected: () => 0,
        signal: controller.signal,
        onResult,
        onWarning: vi.fn(),
        cache: { read: async () => ({ nonsense: true }), write: vi.fn() },
        search: async () => {
          controller.abort();
          return [engineLine(['e2e4'])];
        },
      }),
    ).rejects.toThrow(/cancel/i);
    expect(onResult).not.toHaveBeenCalled();
  });
});
