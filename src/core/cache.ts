import { RULE_VERSION } from './analysis';
import type { Game } from './game';
import { positionCommand } from './game';

export function cacheKey(game: Game, index: number, depth: number): string {
  return JSON.stringify([
    'stockfish-19.0.1-lite-single',
    RULE_VERSION,
    depth,
    positionCommand(game, index),
    game.moves[index].uci,
  ]);
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-lens', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('analysis');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local cache is blocked by another tab.'));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('analysis', mode);
    const request = operation(transaction.objectStore('analysis'));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? request.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Local cache transaction aborted.'));
    };
  });
}

export function readCache(key: string): Promise<unknown> {
  return transact('readonly', (store) => store.get(key));
}
export function writeCache(key: string, value: unknown): Promise<IDBValidKey> {
  return transact('readwrite', (store) => store.put(value, key));
}
export function clearCache(): Promise<undefined> {
  return transact('readwrite', (store) => store.clear());
}
