import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { pieceName, positionCommand, variation } from './game';
import type { Game } from './game';
import { sacrificeReplies, verifySacrifice } from './sacrifice';
import { expectedScore } from './engine-score';
import type { EngineLine } from './engine-score';
import { explainMove } from './coaching';
import type { Coaching } from './coaching';
export { parseInfo, expectedScore, scoreText } from './engine-score';
export type { Score, EngineLine } from './engine-score';
export { pieceName } from './game';

export type Grade =
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Excellent'
  | 'Good'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Miss'
  | 'Blunder';
export type OrdinaryGrade = Exclude<Grade, 'Brilliant' | 'Great' | 'Miss'>;
export const GRADES: Grade[] = [
  'Brilliant',
  'Great',
  'Best',
  'Excellent',
  'Good',
  'Inaccuracy',
  'Mistake',
  'Miss',
  'Blunder',
];
export const RULE_VERSION = 'wdl-v3-coaching';
export interface Review {
  index: number;
  label: Grade;
  ordinary: OrdinaryGrade;
  loss: number;
  best: EngineLine;
  played: EngineLine;
  bestSan: string;
  depth: number;
  explanation: string;
  coaching: Coaching;
}
export type Search = (position: string, depth: number, only?: string) => Promise<EngineLine[]>;

export function classifyLoss(loss: number): OrdinaryGrade {
  if (!Number.isFinite(loss) || loss < 0 || loss > 1)
    throw new Error('Invalid expected-score loss.');
  if (loss < 0.02) return 'Excellent';
  if (loss < 0.05) return 'Good';
  if (loss < 0.1) return 'Inaccuracy';
  if (loss < 0.2) return 'Mistake';
  return 'Blunder';
}

export async function analyzeMove(
  game: Game,
  index: number,
  search: Search,
  depth: number,
): Promise<Review> {
  const move = game.moves[index];
  if (!move) throw new Error('Move index is outside this game.');
  const command = positionCommand(game, index);
  async function evaluate(target: number) {
    const alternatives = await search(command, target);
    const best = alternatives[0];
    if (!best) throw new Error('Engine returned no best move.');
    const played =
      alternatives.find((l) => l.pv[0] === move.uci) ??
      (await search(command, target, move.uci))[0];
    if (!played) throw new Error('Engine returned no evaluation for the played move.');
    return { best, played, alternatives };
  }
  let evaluation = await evaluate(depth);
  let loss = expectedScore(evaluation.best) - expectedScore(evaluation.played);
  const mate = evaluation.best.score.kind === 'mate' || evaluation.played.score.kind === 'mate';
  const sacrifice =
    loss < 0.02 &&
    expectedScore(evaluation.best) >= 0.45 &&
    expectedScore(evaluation.best) < 0.9 &&
    sacrificeReplies(game, index).length > 0;
  if (loss >= 0.1 || loss < -0.005 || mate || sacrifice) {
    evaluation = await evaluate(sacrifice ? Math.max(14, depth + 2) : depth + 2);
    loss = expectedScore(evaluation.best) - expectedScore(evaluation.played);
  }
  if (loss < -0.005)
    throw new Error(`Inconsistent engine scores at move ${move.number}. Retry deeper analysis.`);
  loss = Math.max(0, loss);
  const { best, played, alternatives } = evaluation;
  const bestSan = variation(game.positions[index], best.pv)[0].san;
  const ordinary = best.pv[0] === move.uci ? 'Best' : classifyLoss(loss);
  let label: Grade = ordinary;
  const legal = new Chess(game.positions[index]).moves().length;
  if (
    ordinary === 'Best' &&
    alternatives[1] &&
    legal > 1 &&
    expectedScore(best) >= 0.4 &&
    expectedScore(best) - expectedScore(alternatives[1]) >= 0.25
  )
    label = 'Great';
  if (
    best.score.kind === 'mate' &&
    best.score.value > 0 &&
    expectedScore(played) < 0.9 &&
    loss >= 0.05
  )
    label = 'Miss';
  if (
    sacrifice &&
    loss < 0.02 &&
    expectedScore(best) < 0.9 &&
    expectedScore(played) >= 0.45 &&
    legal > 1 &&
    (await verifySacrifice(game, index, search, Math.max(depth + 2, 14)))
  )
    label = 'Brilliant';
  let explanation =
    ordinary === 'Best'
      ? `${move.san} is the engine's top choice at this depth.`
      : `${move.san} loses ${(loss * 100).toFixed(1)} model expected-score points compared with ${bestSan}.`;
  if (label === 'Great')
    explanation += ' It is the only strong choice among the searched candidates.';
  if (label === 'Miss') explanation += ` A forced mating line starts with ${bestSan}.`;
  if (label === 'Brilliant')
    explanation +=
      ' A sound direct piece sacrifice: searched acceptance lines retain compensation despite a material deficit. This is a conservative heuristic.';
  if (move.san.endsWith('#')) explanation += ' This delivers checkmate.';
  else if (move.captured) explanation += ` The move captures a ${pieceName(move.captured)}.`;
  else if (move.san.endsWith('+')) explanation += ' The move gives check.';
  return {
    index,
    label,
    ordinary,
    loss,
    best,
    played,
    bestSan,
    depth: Math.min(best.depth, played.depth),
    explanation,
    coaching: explainMove(game, index, best, played),
  };
}

export function summarize(game: Game, reviews: (Review | undefined)[], color: Color) {
  const indices = game.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.color === color);
  const analyzed = indices.flatMap(({ i }) => (reviews[i] ? [reviews[i]!] : []));
  const counts = Object.fromEntries(
    GRADES.map((g) => [g, analyzed.filter((r) => r.label === g).length]),
  );
  const phases = (['Opening', 'Middlegame', 'Endgame'] as const).map((name) => {
    const positions = indices.filter(({ m }) => m.phase === name);
    const done = positions.flatMap(({ i }) => (reviews[i] ? [reviews[i]!] : []));
    return {
      name,
      total: positions.length,
      analyzed: done.length,
      loss: done.length ? done.reduce((sum, r) => sum + r.loss, 0) / done.length : null,
    };
  });
  return {
    analyzed: analyzed.length,
    total: indices.length,
    counts,
    phases,
    averageLoss: analyzed.length
      ? analyzed.reduce((s, r) => s + r.loss, 0) / analyzed.length
      : null,
    captures: indices.filter(({ m }) => m.captured).length,
    checks: indices.filter(({ m }) => /[+#]$/.test(m.san)).length,
    critical: analyzed
      .filter((r) => r.loss >= 0.1 || r.label === 'Miss')
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 3),
  };
}
