import { describe, expect, it } from 'vitest';
import { importGame, variation } from './game';
import { SAMPLE_PGN } from './sample';

describe('PGN import', () => {
  it('requires explicit repair for the supplied malformed numbering and headers', () => {
    expect(() => importGame(SAMPLE_PGN)).toThrow(/repair/i);
    const game = importGame(SAMPLE_PGN, true);
    expect(game.moves).toHaveLength(68);
    expect(game.moves[16].san).toBe('Rg1');
    expect(game.moves[30].san).toBe('Qxd4');
    expect(game.moves.at(-1)?.san).toBe('Qc2#');
    expect(game.headers.White).toBe('ripu502');
    expect(game.warnings.length).toBeGreaterThan(0);
    expect(game.positions).toHaveLength(69);
  });

  it('extracts mainline, ignoring comments, NAGs and variations', () => {
    const game = importGame('1. e4 {hello} e5 (1... c5 (2. Nf3)) 2. Nf3 $1 Nc6 *');
    expect(game.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(game.positions[0]).not.toBe(game.positions[1]);
  });

  it('validates SAN instead of silently skipping it', () => {
    expect(() => importGame('1. e4 e5 2. Qh9 *')).toThrow(/Qh9.*3/);
    expect(() => importGame('1. e4 (e5 *')).toThrow(/variation/i);
    expect(() => importGame('1. e4 {oops')).toThrow(/comment/i);
  });

  it('rejects multiple games, empty and oversized input', () => {
    expect(() => importGame('1. e4 * 1. d4 *')).toThrow(/multiple/i);
    expect(() => importGame('[Event "one"]\n\n1. e4 *\n[Event "two"]\n1. d4 *')).toThrow(
      /multiple/i,
    );
    expect(() => importGame('')).toThrow(/moves/i);
    expect(() => importGame('x'.repeat(200_001))).toThrow(/200/);
  });

  it('supports custom positions and promotion and validates FEN metadata', () => {
    const game = importGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 24"]\n\n24. a8=Q+ *');
    expect(game.moves[0].number).toBe(24);
    expect(game.moves[0].uci).toBe('a7a8q');
    expect(() => importGame('[SetUp "1"]\n\n1. e4 *')).toThrow(/FEN/);
  });

  it('reports terminal result conflicts without rejecting resigned games', () => {
    expect(importGame('1. f3 e5 2. g4 Qh4# 1-0').warnings.join()).toMatch(/result/i);
    expect(importGame('1. e4 0-1').warnings).toEqual([]);
  });

  it('replays castling and en passant legally', () => {
    expect(importGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *').moves.at(-1)?.uci).toBe('e1g1');
    expect(importGame('1. e4 a6 2. e5 d5 3. exd6 *').moves.at(-1)?.captured).toBe('p');
  });
});

describe('legal alternative lines', () => {
  it('creates positions from the pre-move board and rejects illegal engine output', () => {
    const fen = importGame('1. e4 *').positions[0];
    const line = variation(fen, ['d2d4', 'd7d5', 'c2c4']);
    expect(line.map((m) => m.san)).toEqual(['d4', 'd5', 'c4']);
    expect(() => variation(fen, ['e7e5'])).toThrow(/engine/i);
  });
});
