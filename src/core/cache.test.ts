import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cacheKey, readCache, writeCache, clearCache } from './cache';
import { importGame } from './game';

describe('compatible local analysis cache', () => {
  it('keys by history, engine, depth and rules; stores and clears records', async () => {
    const game = importGame('1. e4 e5 *');
    expect(cacheKey(game, 0, 10)).not.toBe(cacheKey(game, 1, 10));
    expect(cacheKey(game, 0, 10)).not.toBe(cacheKey(game, 0, 14));
    const key = cacheKey(game, 0, 10);
    expect(await readCache(key)).toBeUndefined();
    await writeCache(key, { value: 5 });
    expect(await readCache(key)).toEqual({ value: 5 });
    await clearCache();
    expect(await readCache(key)).toBeUndefined();
  });
});
