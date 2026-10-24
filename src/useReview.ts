import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game } from './core/game';
import type { Review } from './core/analysis';
import { loadEngine } from './core/engine';
import { readCache, writeCache } from './core/cache';
import { reviewGame } from './core/reviewer';

export function useReview(game: Game | null, selected: number) {
  const [reviews, setReviews] = useState<(Review | undefined)[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready to analyze');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const active = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setBusy(false);
  }, []);
  useEffect(() => {
    stop();
    setReviews([]);
    setError('');
    setWarning('');
    setStatus('Ready to analyze');
    return stop;
  }, [game, stop]);

  const start = async (depth: number) => {
    if (!game) return;
    stop();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setWarning('');
    setReviews([]);
    try {
      const engine = await loadEngine(controller.signal, setStatus);
      const cancel = () => engine.dispose();
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        await reviewGame({
          game,
          depth,
          selected: () => Math.max(0, selectedRef.current - 1),
          signal: controller.signal,
          search: engine.search.bind(engine),
          onResult: (index, review) => {
            setReviews((old) => {
              const next = [...old];
              next[index] = review;
              return next;
            });
            setStatus(
              `Reviewed ${game.moves[index].number}${game.moves[index].color === 'w' ? '.' : '...'} ${game.moves[index].san}`,
            );
          },
          onWarning: (message) => {
            if (!controller.signal.aborted) setWarning(message);
          },
          cache: { read: readCache, write: writeCache },
        });
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        engine.dispose();
      }
      if (!controller.signal.aborted) setStatus('Review complete');
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : String(error));
        setStatus('Analysis stopped');
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  const cancel = () => {
    stop();
    setStatus('Analysis paused. Completed moves remain available.');
  };
  return { reviews, busy, status, error, warning, start, cancel };
}
