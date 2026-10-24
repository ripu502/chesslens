import { describe, expect, it } from 'vitest';
import { openingName, positionFacts } from './insights';
import { importGame } from './game';

describe('evidence-based position insights', () => {
  it('identifies only known opening sequences', () => {
    expect(openingName(importGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 *'))).toBe('Ruy Lopez');
    expect(openingName(importGame('1. a3 *'))).toMatch(/Unrecognized/);
    expect(
      openingName(importGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 24"]\n24. a8=Q+ *')),
    ).toMatch(/Custom/);
  });
  it('reports observable development, pawn structure and material for either side', () => {
    const game = importGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *');
    const white = positionFacts(game.positions.at(-1)!, 'w');
    expect(white.developed).toBe(2);
    expect(white.pawnFiles).toBe(0);
    expect(white.material).toBe(39);
    expect(white.king).toBe('g1');
    expect(positionFacts(game.positions.at(-1)!, 'b').king).toBe('e8');
  });
});
