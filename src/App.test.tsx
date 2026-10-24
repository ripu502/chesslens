import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { clearCache } from './core/cache';
import type { EngineLine } from './core/analysis';

const mocked = vi.hoisted(() => ({
  dispose: vi.fn(),
  load: vi.fn(),
  search: vi.fn(),
}));
vi.mock('./core/engine', () => ({ loadEngine: mocked.load }));

beforeEach(async () => {
  await clearCache();
  mocked.dispose.mockReset();
  mocked.search
    .mockReset()
    .mockImplementation(
      async (position: string, _depth: number, only?: string): Promise<EngineLine[]> => [
        {
          depth: 16,
          nodes: 100,
          multipv: 1,
          score: { kind: 'cp', value: 20 },
          wdl: [200, 700, 100],
          pv: [only ?? (position.includes('moves e2e4') ? 'e7e5' : 'd2d4')],
        },
      ],
    );
  mocked.load.mockReset().mockImplementation(async (_signal, status) => {
    status('Engine ready');
    return { search: mocked.search, dispose: mocked.dispose };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openSmallGame() {
  fireEvent.change(screen.getByLabelText('Game notation (PGN)'), {
    target: { value: '[White "Alice"]\n[Black "Bob"]\n1. e4 e5 *' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open game' }));
}

describe('review application', () => {
  it('requires explicit sample repair; navigates all positions and flips the board', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open game' }));
    expect(screen.getByRole('alert').textContent).toMatch(/repair required/);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Open game' }));
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(screen.getByRole('heading', { name: '1. e4' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Last position' }));
    expect(screen.getByRole('heading', { name: '34... Qc2#' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Flip board' }));
    expect(screen.getAllByRole('gridcell')[0].getAttribute('aria-label')).toBe('h1 empty');
    fireEvent.click(screen.getByRole('button', { name: 'First position' }));
    expect(screen.getByRole('heading', { name: 'A fresh board.' })).toBeDefined();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: '1. e4' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }));
    expect(screen.getByRole('heading', { name: 'A fresh board.' })).toBeDefined();
  });

  it('analyzes both players and explores legal best-move arrows and continuations', async () => {
    render(<App />);
    openSmallGame();
    fireEvent.change(screen.getByLabelText('Analysis quality'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze game' }));
    await screen.findByText('Review complete');
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }));
    expect(screen.getByRole('heading', { name: '1. e4' })).toBeDefined();
    expect(screen.getByText(/model expected-score points/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Show best move/ }));
    expect(screen.getByRole('img', { name: 'Suggested move d2 to d4' })).toBeDefined();
    expect(screen.getByRole('gridcell', { name: 'e2 white pawn' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Play next in line' }));
    expect(screen.getByRole('gridcell', { name: 'd4 white pawn' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Previous in line' }));
    fireEvent.click(screen.getByRole('button', { name: 'd4' }));
    fireEvent.click(screen.getByRole('button', { name: /Return to game/ }));
    expect(screen.getByRole('gridcell', { name: 'e4 white pawn' })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Player comparison' }));
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeDefined();
    expect(screen.getAllByText('No endgame reached')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Move review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to 1... e5' }));
    expect(screen.getByRole('heading', { name: '1... e5' })).toBeDefined();
    fireEvent.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: '1. e4 Excellent' }),
    );
    expect(screen.getByRole('heading', { name: '1. e4' })).toBeDefined();
  });

  it('surfaces engine errors and can cancel and retry', async () => {
    render(<App />);
    openSmallGame();
    mocked.load.mockRejectedValueOnce(new Error('WASM blocked'));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze game' }));
    expect((await screen.findByRole('alert')).textContent).toContain('WASM blocked');
    mocked.search.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze game' }));
    await screen.findByText('Engine ready');
    fireEvent.click(screen.getByRole('button', { name: 'Pause analysis' }));
    expect(screen.getByRole('status').textContent).toMatch(/paused/);
    expect(mocked.dispose).toHaveBeenCalled();
  });

  it('explains the queen fork and replays the opponent response separately from the best line', async () => {
    mocked.search.mockImplementation(
      async (position: string, _d: number, only?: string): Promise<EngineLine[]> => {
        if (!position.includes('b1c3')) return new Promise(() => {});
        return [
          {
            depth: 16,
            nodes: 100,
            multipv: 1,
            score: { kind: 'cp', value: only ? -850 : 34 },
            wdl: only ? [0, 0, 1000] : [300, 600, 100],
            pv: only ? ['g1h1', 'e5f3', 'e1e2', 'f3d4'] : ['f1e2', 'e8g8', 'c1e3', 'd7e8'],
          },
        ];
      },
    );
    render(<App />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Open game' }));
    fireEvent.click(screen.getByRole('button', { name: '19. Rh1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Analyze game' }));
    await screen.findByRole('heading', { name: 'Why this is a blunder' });
    fireEvent.click(screen.getByRole('button', { name: 'Pause analysis' }));
    expect(screen.getByRole('heading', { name: 'How Be2 helps' })).toBeDefined();
    expect(screen.getByText(/Be2 makes Bxf3 available/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Show opponent response' }));
    expect(screen.getByRole('img', { name: 'Suggested move e5 to f3' })).toBeDefined();
    expect(screen.getByRole('gridcell', { name: 'h1 white rook' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Play next in line' }));
    expect(screen.getByRole('gridcell', { name: 'f3 black knight' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Ke2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nxd4+' }));
    expect(screen.getByRole('gridcell', { name: 'd4 black knight' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Show best move' }));
    expect(screen.getByRole('img', { name: 'Suggested move f1 to e2' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Return to game' }));
    expect(screen.getByRole('gridcell', { name: 'd4 white queen' })).toBeDefined();
    expect(screen.getByRole('gridcell', { name: 'h1 white rook' })).toBeDefined();
  });

  it('imports file text, reports size errors, resets sample and clears cache explicitly', async () => {
    render(<App />);
    const file = new File(['1. e4 *'], 'game.pgn');
    Object.defineProperty(file, 'text', { value: async () => '1. e4 *' });
    fireEvent.change(screen.getByLabelText('Choose PGN file'), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByLabelText('Game notation (PGN)') as HTMLTextAreaElement).value).toBe(
        '1. e4 *',
      ),
    );
    const large = new File([''], 'large.pgn');
    Object.defineProperty(large, 'size', { value: 900_000 });
    fireEvent.change(screen.getByLabelText('Choose PGN file'), { target: { files: [large] } });
    expect(screen.getByRole('alert').textContent).toMatch(/too large/);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample game' }));
    expect(screen.queryByRole('alert')).toBeNull();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear local cache' }));
    await screen.findByText('Local analysis cache cleared.');
    await act(async () => {});
  });
});
