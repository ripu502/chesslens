import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Board } from './Board';
import { importGame } from '../core/game';

afterEach(cleanup);
describe('board coordinates and arrows', () => {
  it('renders 64 labeled squares and highlights played squares', () => {
    const game = importGame('1. e4 *');
    render(<Board fen={game.positions[1]} flipped={false} last={game.moves[0]} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
    expect(screen.getByRole('gridcell', { name: 'e4 white pawn' }).className).toContain(
      'highlight',
    );
    expect(screen.getByRole('gridcell', { name: 'a8 black rook' })).toBeDefined();
  });
  it('draws suggestions in correct coordinates before and after flipping', () => {
    const game = importGame('1. e4 *');
    const { container, rerender } = render(
      <Board fen={game.positions[0]} flipped={false} arrow={{ from: 'e2', to: 'e4' }} />,
    );
    expect(container.querySelector('line')?.getAttribute('x1')).toBe('4.5');
    expect(container.querySelector('line')?.getAttribute('y1')).toBe('6.5');
    rerender(<Board fen={game.positions[0]} flipped arrow={{ from: 'e2', to: 'e4' }} />);
    expect(container.querySelector('line')?.getAttribute('x1')).toBe('3.5');
    expect(container.querySelector('line')?.getAttribute('y1')).toBe('1.5');
  });
});
