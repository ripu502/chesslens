import { analyzeMove, GRADES } from './analysis';
import type { EngineLine, Review, Search } from './analysis';
import { cacheKey } from './cache';
import type { Game } from './game';
import { variation } from './game';
import { explainMove } from './coaching';

interface Options {
  game: Game;
  depth: number;
  selected: () => number;
  signal: AbortSignal;
  search: Search;
  onResult: (index: number, review: Review) => void;
  onWarning: (message: string) => void;
  cache: {
    read: (key: string) => Promise<unknown>;
    write: (key: string, review: Review) => Promise<unknown>;
  };
}

function isLine(value: unknown): value is EngineLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<EngineLine>;
  return (
    typeof line.depth === 'number' &&
    line.depth > 0 &&
    Number.isFinite(line.nodes) &&
    line.multipv !== undefined &&
    ['cp', 'mate'].includes(line.score?.kind ?? '') &&
    Number.isFinite(line.score?.value) &&
    Array.isArray(line.pv) &&
    line.pv.length > 0 &&
    line.pv.every((p) => typeof p === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(p)) &&
    (line.score?.kind === 'mate' ||
      (Array.isArray(line.wdl) &&
        line.wdl.length === 3 &&
        line.wdl.every((n) => Number.isFinite(n) && n >= 0) &&
        line.wdl.reduce((a, b) => a + b, 0) === 1000))
  );
}

function isReview(value: unknown, index: number, depth: number): value is Review {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Review>;
  return (
    r.index === index &&
    GRADES.includes(r.label!) &&
    ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'].includes(r.ordinary!) &&
    typeof r.loss === 'number' &&
    r.loss >= 0 &&
    r.loss <= 1 &&
    isLine(r.best) &&
    isLine(r.played) &&
    typeof r.bestSan === 'string' &&
    typeof r.explanation === 'string' &&
    typeof r.depth === 'number' &&
    r.depth >= depth
  );
}

export async function reviewGame(options: Options): Promise<void> {
  const { game, depth, selected, signal, search, onResult, onWarning, cache } = options;
  const pending = new Set(game.moves.map((_m, i) => i));
  let caching = true;
  const check = () => {
    if (signal.aborted) throw new DOMException('Analysis cancelled.', 'AbortError');
  };
  while (pending.size) {
    check();
    const wanted = selected();
    const index = pending.has(wanted) ? wanted : pending.values().next().value!;
    const key = cacheKey(game, index, depth);
    let review: Review | undefined;
    if (caching) {
      try {
        const cached = await cache.read(key);
        if (cached !== undefined) {
          if (!isReview(cached, index, depth))
            throw new Error('Cached review is invalid; recomputing.');
          const bestLine = variation(game.positions[index], cached.best.pv);
          variation(game.positions[index], cached.played.pv);
          if (cached.played.pv[0] !== game.moves[index].uci || bestLine[0].san !== cached.bestSan) {
            throw new Error('Cached moves do not match this review; recomputing.');
          }
          review = { ...cached, coaching: explainMove(game, index, cached.best, cached.played) };
        }
      } catch (error) {
        caching = false;
        onWarning(
          `Local cache unavailable: ${error instanceof Error ? error.message : String(error)} Continuing in memory.`,
        );
      }
    }
    check();
    if (!review) {
      review = await analyzeMove(game, index, search, depth);
      check();
      if (caching) {
        try {
          await cache.write(key, review);
        } catch (error) {
          caching = false;
          onWarning(
            `Could not save local cache: ${error instanceof Error ? error.message : String(error)} Continuing in memory.`,
          );
        }
      }
    }
    check();
    onResult(index, review);
    pending.delete(index);
  }
}
