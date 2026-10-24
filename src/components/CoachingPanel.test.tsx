import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachingPanel } from './CoachingPanel';
import { explainMove } from '../core/coaching';
import { importGame } from '../core/game';
import type { EngineLine } from '../core/engine-score';

afterEach(cleanup);
const line = (pv: string[]): EngineLine => ({
  depth: 14,
  nodes: 100,
  multipv: 1,
  score: { kind: 'cp', value: 0 },
  pv,
});

describe('move justification panel', () => {
  it.each(['Inaccuracy', 'Mistake', 'Miss'] as const)(
    'explains %s and exposes both lines',
    (label) => {
      const game = importGame('1. a3 *');
      const coaching = explainMove(game, 0, line(['e2e4', 'e7e5']), line(['a2a3', 'd7d5']));
      const onShow = vi.fn();
      const onReturn = vi.fn();
      const { rerender } = render(
        <CoachingPanel
          coaching={coaching}
          bestSan="e4"
          label={label}
          preview={null}
          onShow={onShow}
          onReturn={onReturn}
        />,
      );
      expect(
        screen.getByRole('heading', { name: new RegExp(`Why this is .*${label.toLowerCase()}`) }),
      ).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'Show opponent response' }));
      expect(onShow).toHaveBeenLastCalledWith('played');
      rerender(
        <CoachingPanel
          coaching={coaching}
          bestSan="e4"
          label={label}
          preview="played"
          onShow={onShow}
          onReturn={onReturn}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Return to game' }));
      expect(onReturn).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Show best move' }));
      expect(onShow).toHaveBeenLastCalledWith('best');
    },
  );
});
