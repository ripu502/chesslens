import { describe, expect, it } from 'vitest';
import { explainMove } from './coaching';
import { importGame } from './game';
import { SAMPLE_PGN } from './sample';
import type { EngineLine } from './engine-score';

function engineLine(pv: string[], value = 0, kind: 'cp' | 'mate' = 'cp'): EngineLine {
  return { depth: 14, nodes: 100, multipv: 1, score: { kind, value }, pv };
}

describe('evidence-backed move explanations', () => {
  it('explains the sample queen loss, opponent check, and material saved by the alternative', () => {
    const game = importGame(SAMPLE_PGN, true);
    const coaching = explainMove(
      game,
      36,
      engineLine(['f1e2', 'e8g8', 'c1e3', 'd7e8'], 34),
      engineLine(['g1h1', 'e5f3', 'e1e2', 'f3d4'], -850),
    );
    expect(coaching.why).toMatch(/Nxf3\+.*check/);
    expect(coaching.why).toMatch(/fork.*king.*queen on d4/);
    expect(coaching.played.facts.join(' ')).toMatch(/Nxd4\+.*queen on d4/);
    expect(coaching.played.materialChange).toBe(-10);
    expect(coaching.best.materialChange).toBe(0);
    expect(coaching.better).toMatch(/preserves 10 more material points/);
    expect(coaching.better).toMatch(/Be2 makes Bxf3 available.*knight on f3/);
    expect(coaching.lesson).toMatch(/checks.*captures/i);
    expect(coaching.played.notation).toBe('19. Rh1 Nxf3+ 20. Ke2 Nxd4+');
  });

  it('counts recaptures rather than calling every capture a lost piece', () => {
    const game = importGame('1. e4 d5 2. exd5 Qxd5 *');
    const coaching = explainMove(
      game,
      2,
      engineLine(['e4d5', 'd8d5']),
      engineLine(['e4d5', 'd8d5']),
    );
    expect(coaching.played.materialChange).toBe(0);
    expect(coaching.played.summary).toMatch(/no net material change/i);
    expect(coaching.better).toMatch(/already played/i);
    expect(coaching.better).not.toMatch(/preserves/);
  });

  it('distinguishes allowing mate, missing mate and delivering mate for either color', () => {
    const game = importGame('1. f3 e5 2. g4 Qh4# 0-1');
    const punished = explainMove(
      game,
      2,
      engineLine(['b1c3'], 0),
      engineLine(['g2g4', 'd8h4'], -1, 'mate'),
    );
    expect(punished.why).toMatch(/allows.*mate in 1/i);
    expect(punished.played.facts.join(' ')).toMatch(/Black.*checkmate/);
    expect(punished.better).toMatch(/avoids the forced mate detected/);
    const finish = explainMove(
      game,
      3,
      engineLine(['d8h4'], 1, 'mate'),
      engineLine(['d8h4'], 1, 'mate'),
    );
    expect(finish.why).toMatch(/delivers checkmate/);
    const missedGame = importGame('1. f3 e5 2. g4 Nc6 *');
    const missed = explainMove(
      missedGame,
      3,
      engineLine(['d8h4'], 1, 'mate'),
      engineLine(['b8c6', 'b1c3'], 0),
    );
    expect(missed.better).toMatch(/mate in 1/);
    expect(missed.why).toMatch(/misses.*mate in 1/);
  });

  it('describes development and center pressure without claiming they prove the grade', () => {
    const game = importGame('1. e4 e5 2. a3 *');
    const coaching = explainMove(
      game,
      2,
      engineLine(['g1f3', 'b8c6'], 30),
      engineLine(['a2a3', 'b8c6'], -20),
    );
    expect(coaching.best.facts.join(' ')).toMatch(/develops.*knight/);
    expect(coaching.best.facts.join(' ')).toMatch(/e5/);
    expect(coaching.better).toMatch(/Nf3/);
    expect(coaching.limitation).toMatch(/not.*forced|not.*proof/i);
    expect(coaching.lesson).toMatch(/development/i);
  });

  it('detects a check-and-queen fork with an actual later capture', () => {
    const game = importGame(SAMPLE_PGN, true);
    const coaching = explainMove(
      game,
      36,
      engineLine(['f1e2', 'e8g8', 'c1e3', 'd7e8']),
      engineLine(['g1h1', 'e5f3', 'e1e2', 'f3d4']),
    );
    expect(coaching.played.facts.join(' ')).toMatch(/fork.*king.*queen on d4/i);
  });

  it('does not compare material from different horizons or invent a tactical cause', () => {
    const game = importGame('1. a3 *');
    const coaching = explainMove(game, 0, engineLine(['d2d4', 'd7d5']), engineLine(['a2a3']));
    expect(coaching.why).toMatch(/too short.*tactical cause/i);
    expect(coaching.better).not.toMatch(/preserves/);
    expect(coaching.limitation).toMatch(/1 half-move/);
    expect(coaching.played.notation).toBe('1. a3');
  });

  it('explains moving a queen away from a threatened capture and a material-winning alternative', () => {
    const game = importGame('[SetUp "1"]\n[FEN "7k/8/8/8/8/2b5/P2Q4/7K w - - 0 1"]\n1. a3 *');
    const coaching = explainMove(
      game,
      0,
      engineLine(['d2c3', 'h8g8']),
      engineLine(['a2a3', 'c3d2']),
    );
    expect(coaching.better).toMatch(/moves the queen away from d2/);
    expect(coaching.best.summary).toMatch(/gains 3 net material points/);
    expect(coaching.best.facts.join()).toMatch(/captures Black's bishop on c3/);
  });

  it('explains promotion, castling, en passant and illegal continuations accurately', () => {
    const promotion = importGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 24"]\n24. a8=Q+ *');
    const coach = explainMove(promotion, 0, engineLine(['a7a8q']), engineLine(['a7a8q']));
    expect(coach.best.facts.join(' ')).toMatch(/promotes.*queen/);
    expect(coach.best.materialChange).toBe(8);
    const castle = importGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *');
    expect(
      explainMove(castle, 6, engineLine(['e1g1']), engineLine(['e1g1'])).best.facts.join(),
    ).toMatch(/castles/);
    const ep = importGame('1. e4 a6 2. e5 d5 3. exd6 *');
    expect(
      explainMove(ep, 4, engineLine(['e5d6']), engineLine(['e5d6'])).best.facts.join(),
    ).toMatch(/pawn on d5.*en passant/);
    expect(() => explainMove(ep, 4, engineLine(['e5e8']), engineLine(['e5d6']))).toThrow(
      /engine continuation/i,
    );
    expect(() => explainMove(ep, 4, engineLine(['e5d6']), engineLine(['e5e8']))).toThrow(
      /played move/,
    );
  });
});
