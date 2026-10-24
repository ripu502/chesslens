import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import { expectedScore } from './engine-score';
import type { Search } from './analysis';
import { MATERIAL_VALUES, positionCommand, variation } from './game';
import type { Game } from './game';

function balance(fen: string, color: Color): number {
  return new Chess(fen)
    .board()
    .flat()
    .reduce(
      (total, piece) =>
        total + (piece ? MATERIAL_VALUES[piece.type] * (piece.color === color ? 1 : -1) : 0),
      0,
    );
}

export function sacrificeReplies(game: Game, index: number) {
  const move = game.moves[index];
  if (
    move.piece === 'p' ||
    move.piece === 'k' ||
    MATERIAL_VALUES[move.piece] - (move.captured ? MATERIAL_VALUES[move.captured] : 0) < 2
  )
    return [];
  return new Chess(game.positions[index + 1])
    .moves({ verbose: true })
    .filter((reply) => reply.to === move.to && reply.captured)
    .map((reply) => ({ uci: reply.from + reply.to + (reply.promotion ?? '') }));
}

export async function verifySacrifice(
  game: Game,
  index: number,
  search: Search,
  depth: number,
): Promise<boolean> {
  const replies = sacrificeReplies(game, index);
  if (!replies.length) return false;
  const before = balance(game.positions[index], game.moves[index].color);
  for (const reply of replies) {
    const line = (
      await search(positionCommand(game, index + 1), Math.max(14, depth), reply.uci)
    )[0];
    if (!line) throw new Error('Engine returned no sacrifice verification line.');
    if (
      line.depth < 14 ||
      (line.pv.length < 4 && !(line.score.kind === 'mate' && line.score.value < 0))
    )
      return false;
    if (expectedScore(line) > 0.55) return false;
    const continuation = variation(game.positions[index + 1], line.pv.slice(0, 6));
    if (
      line.pv[0] !== reply.uci ||
      before - balance(continuation.at(-1)!.fen, game.moves[index].color) < 2
    )
      return false;
  }
  return true;
}
