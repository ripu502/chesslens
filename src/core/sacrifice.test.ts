import { describe, expect, it, vi } from 'vitest';
import { sacrificeReplies, verifySacrifice } from './sacrifice';
import { importGame } from './game';
import type { EngineLine } from './analysis';

const PGN =
  '[SetUp "1"]\n[FEN "rnbq1rk1/ppp2ppp/3bpn2/3p4/3P4/3B1N2/PPP2PPP/RNBQ1RK1 w - - 0 8"]\n8. Bxh7+ *';
const reply = (move: string, wdl: [number, number, number], pv = [move]): EngineLine => ({
  depth: 14,
  multipv: 1,
  nodes: 1000,
  score: { kind: 'cp', value: 0 },
  wdl,
  pv,
});

describe('conservative sacrifice verification', () => {
  it('requires a legal acceptance, not a pawn, king, or equal exchange', () => {
    const game = importGame(PGN);
    expect(sacrificeReplies(game, 0).map((m) => m.uci)).toContain('g8h7');
    expect(sacrificeReplies(importGame('1. e4 *'), 0)).toEqual([]);
    expect(sacrificeReplies(importGame('1. e4 e5 2. Nf3 *'), 2)).toEqual([]);
  });

  it('verifies all acceptance lines and rejects unsound or quickly recouped sacrifices', async () => {
    const game = importGame(PGN);
    const search = vi.fn(async (_p: string, _d: number, only?: string) => [
      reply(only!, [200, 600, 200], [only!, 'f3g5', only === 'g8h7' ? 'h7g8' : 'h7g5', 'd1h5']),
    ]);
    expect(await verifySacrifice(game, 0, search, 14)).toBe(true);
    expect(search.mock.calls.length).toBe(sacrificeReplies(game, 0).length);
    expect(
      await verifySacrifice(
        game,
        0,
        async (_p, _d, only) => [
          reply(only!, [900, 100, 0], [only!, 'f3g5', only === 'g8h7' ? 'h7g8' : 'h7g5', 'd1h5']),
        ],
        14,
      ),
    ).toBe(false);
    expect(
      await verifySacrifice(game, 0, async (_p, _d, only) => [reply(only!, [200, 600, 200])], 14),
    ).toBe(false);
    expect(await verifySacrifice(importGame('1. e4 *'), 0, search, 14)).toBe(false);
    await expect(verifySacrifice(game, 0, async () => [], 14)).rejects.toThrow(/sacrifice/i);
  });
});
