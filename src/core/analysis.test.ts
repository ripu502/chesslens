import { describe, expect, it } from 'vitest';
import {
  classifyLoss,
  expectedScore,
  parseInfo,
  scoreText,
  analyzeMove,
  summarize,
} from './analysis';
import type { EngineLine, Search } from './analysis';
import { importGame } from './game';

const line = (
  move: string,
  cp: number,
  wdl: [number, number, number] = [500, 400, 100],
): EngineLine => ({
  depth: 14,
  nodes: 1000,
  multipv: 1,
  score: { kind: 'cp', value: cp },
  wdl,
  pv: [move],
});

describe('engine scores', () => {
  it('parses complete scores, WDL and PV; ignores bounds and incomplete lines', () => {
    expect(
      parseInfo('info depth 12 nodes 123 multipv 2 score cp -40 wdl 100 500 400 pv e2e4 e7e5'),
    ).toEqual({
      depth: 12,
      nodes: 123,
      multipv: 2,
      score: { kind: 'cp', value: -40 },
      wdl: [100, 500, 400],
      pv: ['e2e4', 'e7e5'],
    });
    expect(parseInfo('info depth 3 score mate -2 pv e2e4')?.score).toEqual({
      kind: 'mate',
      value: -2,
    });
    expect(parseInfo('info depth 4 score cp 30 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info string hello')).toBeNull();
    expect(parseInfo('info depth 4 score cp 20')).toBeNull();
  });

  it('keeps mate distinct and normalizes score display', () => {
    expect(expectedScore(line('e2e4', 10))).toBe(0.7);
    expect(expectedScore({ ...line('e2e4', 0), score: { kind: 'mate', value: -2 } })).toBe(0);
    expect(scoreText({ kind: 'cp', value: 123 }, 'b')).toBe('-1.23');
    expect(scoreText({ kind: 'mate', value: 3 }, 'b')).toBe('-M3');
    expect(() => expectedScore({ ...line('e2e4', 0), wdl: undefined })).toThrow(/WDL/);
  });
});

describe('classification boundaries', () => {
  it.each([
    [0, 'Excellent'],
    [0.019, 'Excellent'],
    [0.02, 'Good'],
    [0.05, 'Inaccuracy'],
    [0.1, 'Mistake'],
    [0.2, 'Blunder'],
    [1, 'Blunder'],
  ])('classifies loss %s as %s', (loss, label) => expect(classifyLoss(loss)).toBe(label));
  it('rejects invalid probabilities', () => {
    expect(() => classifyLoss(-0.1)).toThrow();
    expect(() => classifyLoss(NaN)).toThrow();
  });
});

describe('move analysis', () => {
  it('searches missing played moves rather than guessing their grade', async () => {
    const game = importGame('1. e4 *');
    const calls: (string | undefined)[] = [];
    const search: Search = async (_position, _depth, only) => {
      calls.push(only);
      return only ? [line(only, -200, [0, 400, 600])] : [line('d2d4', 100)];
    };
    const result = await analyzeMove(game, 0, search, 10);
    expect(calls).toEqual([undefined, 'e2e4', undefined, 'e2e4']);
    expect(result.label).toBe('Blunder');
    expect(result.bestSan).toBe('d4');
    expect(result.loss).toBeCloseTo(0.5);
    expect(result.depth).toBe(14);
  });

  it('recognizes best moves and excludes forced moves from Great', async () => {
    const game = importGame('1. e4 *');
    const result = await analyzeMove(game, 0, async () => [line('e2e4', 20)], 10);
    expect(result.label).toBe('Best');
    expect(result.loss).toBe(0);
    expect(summarize(game, [result], 'w').analyzed).toBe(1);
    expect(summarize(game, [result], 'b').analyzed).toBe(0);
  });

  it('does not finalize inconsistent search scores', async () => {
    const game = importGame('1. e4 *');
    await expect(
      analyzeMove(
        game,
        0,
        async (_p, _d, only) =>
          only ? [line(only, 100, [900, 100, 0])] : [line('d2d4', 0, [0, 500, 500])],
        10,
      ),
    ).rejects.toThrow(/inconsistent/i);
  });

  it('recognizes a uniquely strong choice and a missed mating opportunity', async () => {
    const game = importGame('1. e4 *');
    const great = await analyzeMove(
      game,
      0,
      async () => [
        line('e2e4', 200, [600, 400, 0]),
        { ...line('d2d4', -200, [0, 600, 400]), multipv: 2 },
      ],
      10,
    );
    expect(great.label).toBe('Great');
    const miss = await analyzeMove(
      game,
      0,
      async (_p, _d, only) =>
        only
          ? [line(only, 0, [100, 800, 100])]
          : [{ ...line('d2d4', 0), score: { kind: 'mate', value: 4 } }],
      10,
    );
    expect(miss.label).toBe('Miss');
    expect(miss.ordinary).toBe('Blunder');
    expect(miss.explanation).toMatch(/mating/);
  });

  it('only awards Brilliant after verified, deeper acceptance searches', async () => {
    const game = importGame(
      '[SetUp "1"]\n[FEN "rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 8"]\n8. Bxh7+ *',
    );
    const result = await analyzeMove(
      game,
      0,
      async (_p, _d, only) =>
        only
          ? [
              {
                ...line(only, 0, [100, 800, 100]),
                pv: [only, 'f3g5', only === 'g8h7' ? 'h7g8' : 'h7g5', 'd1h5'],
              },
            ]
          : [line('d3h7', 0, [100, 800, 100])],
      10,
    );
    expect(result.label).toBe('Brilliant');
    expect(result.explanation).toMatch(/sacrifice/);
    expect(result.explanation).toMatch(/bishop|pawn/);
  });

  it('describes checks and checkmate and rejects invalid move indices or empty output', async () => {
    const game = importGame('1. f3 e5 2. g4 Qh4# 0-1');
    const result = await analyzeMove(game, 3, async () => [line('d8h4', 0)], 10);
    expect(result.explanation).toMatch(/checkmate/);
    const check = importGame('1. e4 f6 2. Qh5+ *');
    expect((await analyzeMove(check, 2, async () => [line('d1h5', 0)], 10)).explanation).toMatch(
      /gives check/,
    );
    await expect(analyzeMove(game, 9, async () => [], 10)).rejects.toThrow(/index/);
    await expect(analyzeMove(game, 0, async () => [], 10)).rejects.toThrow(/best move/);
    await expect(
      analyzeMove(game, 0, async (_p, _d, only) => (only ? [] : [line('e2e4', 0)]), 10),
    ).rejects.toThrow(/played move/);
  });
});
