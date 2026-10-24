import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import { MATERIAL_VALUES, pieceName, variation } from './game';
import type { Game } from './game';
import type { EngineLine } from './engine-score';

export const EXPLANATION_PLIES = 10;

export interface LineEvidence {
  notation: string;
  facts: string[];
  summary: string;
  materialChange: number;
  plies: number;
}

export interface Coaching {
  why: string;
  better: string;
  lesson: string;
  limitation: string;
  played: LineEvidence;
  best: LineEvidence;
}

function side(color: Color): string {
  return color === 'w' ? 'White' : 'Black';
}

function material(fen: string, color: Color): number {
  return new Chess(fen)
    .board()
    .flat()
    .reduce(
      (sum, piece) =>
        sum + (piece ? MATERIAL_VALUES[piece.type] * (piece.color === color ? 1 : -1) : 0),
      0,
    );
}

function trace(fen: string, line: EngineLine, color: Color) {
  const steps = variation(fen, line.pv.slice(0, EXPLANATION_PLIES));
  if (!steps.length) throw new Error('Engine continuation is empty. Retry analysis.');
  const before = [fen, ...steps.map((step) => step.fen)];
  const named = steps.map(
    (step, i) =>
      `${new Chess(before[i]).moveNumber()}${step.color === 'w' ? '.' : '...'} ${step.san}`,
  );
  const notation = steps
    .map((step, i) => (step.color === 'w' || i === 0 ? named[i] : step.san))
    .join(' ');
  const facts: string[] = [];
  let fork: string | undefined;
  const root = steps[0];
  let rootIdea = '';
  if (root.san.startsWith('O-O')) {
    rootIdea = `${named[0]} castles, bringing the king to ${root.to} and the rook into play.`;
  } else if (
    ['n', 'b'].includes(root.piece) &&
    root.from[1] === (color === 'w' ? '1' : '8') &&
    root.to[1] !== root.from[1]
  ) {
    rootIdea = `${named[0]} develops the ${pieceName(root.piece)} from ${root.from} to ${root.to}.`;
    const board = new Chess(root.fen);
    const targets: Square[] = ['d4', 'e4', 'd5', 'e5'];
    const attacks = targets.filter(
      (square) =>
        board.get(square)?.color !== color && board.attackers(square, color).includes(root.to),
    );
    if (attacks.length)
      rootIdea += ` From ${root.to}, it attacks ${attacks.join(' and ')} in the center.`;
  } else if (root.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(root.to)) {
    rootIdea = `${named[0]} places a pawn on ${root.to}, occupying the center.`;
  }
  if (rootIdea) facts.push(rootIdea);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = `${named[i]}: ${side(step.color)}`;
    if (step.san.endsWith('#')) {
      facts.push(`${prefix} delivers checkmate.`);
    } else if (step.san.endsWith('+')) {
      facts.push(`${prefix} gives check, so the king's safety must be addressed.`);
      const next = steps[i + 2];
      if (
        next &&
        next.from === step.to &&
        next.captured &&
        MATERIAL_VALUES[next.captured] >= 3 &&
        new Chess(step.fen).attackers(next.to, step.color).includes(step.to)
      ) {
        const description = `${named[i]} creates a fork of the king and ${pieceName(next.captured)} on ${next.to}; ${named[i + 2]} captures that piece in this line.`;
        facts.push(description);
        fork ??= description;
      }
    }
    if (step.captured) {
      const enPassant = step.piece === 'p' && !new Chess(before[i]).get(step.to);
      const square = enPassant ? step.to[0] + step.from[1] : step.to;
      facts.push(
        `${prefix} captures ${side(step.color === 'w' ? 'b' : 'w')}'s ${pieceName(step.captured)} on ${square}${enPassant ? ' en passant' : ''}.`,
      );
    }
    if (step.promotion)
      facts.push(`${prefix} promotes the pawn to a ${pieceName(step.promotion)}.`);
  }
  const materialChange = material(steps.at(-1)!.fen, color) - material(fen, color);
  const summary =
    materialChange === 0
      ? `No net material change for ${side(color)} within these ${steps.length} half-moves.`
      : `${side(color)} ${materialChange > 0 ? 'gains' : 'loses'} ${Math.abs(materialChange)} net material point${Math.abs(materialChange) === 1 ? '' : 's'} within these ${steps.length} half-moves, including recaptures and promotions.`;
  return {
    steps,
    named,
    rootIdea,
    fork,
    evidence: { notation, facts, summary, materialChange, plies: steps.length },
  };
}

export function explainMove(
  game: Game,
  index: number,
  best: EngineLine,
  played: EngineLine,
): Coaching {
  const move = game.moves[index];
  const fen = game.positions[index];
  if (!move || played.pv[0] !== move.uci)
    throw new Error('Engine continuation does not start with the played move.');
  const good = trace(fen, best, move.color);
  const bad = trace(fen, played, move.color);
  const bestSan = good.steps[0].san;
  const same = best.pv[0] === played.pv[0];
  const allowsMate = played.score.kind === 'mate' && played.score.value < 0;
  const bestMates = best.score.kind === 'mate' && best.score.value > 0;
  const missedMate = bestMates && !(played.score.kind === 'mate' && played.score.value > 0);
  const capture = bad.steps.find(
    (step, i) =>
      i > 0 && step.color !== move.color && step.captured && MATERIAL_VALUES[step.captured] >= 3,
  );
  let why = same
    ? `${move.san} follows the engine's preferred continuation.`
    : `${move.san} gives the opponent a stronger continuation than ${bestSan}.`;
  if (bad.steps[0].san.endsWith('#')) why = `${move.san} delivers checkmate.`;
  else if (allowsMate)
    why += ` It allows an engine-detected forced mate in ${Math.abs(played.score.value)} for ${side(move.color === 'w' ? 'b' : 'w')}.`;
  else if (missedMate)
    why += ` It misses the engine-detected mate in ${best.score.value} available with ${bestSan}.`;
  if (bad.steps[1]) {
    const reply = bad.steps[1];
    why += ` After ${move.san}, ${side(reply.color)} can reply ${bad.named[1]}${reply.san.endsWith('#') ? ', delivering checkmate' : reply.san.endsWith('+') ? ', giving check' : ''}.`;
  }
  if (capture && bad.evidence.materialChange < 0) {
    const i = bad.steps.indexOf(capture);
    why += bad.fork
      ? ` ${bad.fork} ${bad.evidence.summary}`
      : ` In the shown continuation, ${bad.named[i]} captures your ${pieceName(capture.captured!)} on ${capture.to}. ${bad.evidence.summary}`;
  } else if (!same && !allowsMate && !missedMate) {
    if (bad.evidence.materialChange < 0) why += ` ${bad.evidence.summary}`;
    else if (bad.steps.length < 2)
      why +=
        ' The returned line is too short to establish a tactical cause. Use Deeper analysis for more evidence.';
    else if (good.rootIdea && !bad.rootIdea)
      why += ` Unlike ${bestSan}, this move does not achieve the concrete idea described below. The engine prefers the resulting position; the line does not prove a forced material loss.`;
    else
      why +=
        ' No net material loss is demonstrated in this excerpt. The grade reflects the engine evaluation, not a proven lost piece.';
  }
  let better = same
    ? `You already played ${bestSan}, the recommended move.`
    : `${bestSan} improves on ${move.san}.`;
  if (!same && allowsMate && !(best.score.kind === 'mate' && best.score.value < 0)) {
    better += ' It avoids the forced mate detected after the played move at this search depth.';
  } else if (!same && bestMates) {
    better += ` It ${missedMate ? 'keeps a forced' : 'continues the'} mate in ${best.score.value} in the engine search.`;
  }
  if (good.rootIdea) better += ` ${good.rootIdea}`;
  const reply = bad.steps[1];
  let defensiveIdea = '';
  if (!same && reply) {
    const alternative = new Chess(good.steps[0].fen);
    const original = new Chess(bad.steps[0].fen);
    const response = alternative
      .moves({ verbose: true })
      .find((m) => m.from === reply.from && m.to === reply.to && m.promotion === reply.promotion);
    if (reply.captured && good.steps[0].from === reply.to) {
      defensiveIdea = `${bestSan} moves the ${pieceName(good.steps[0].piece)} away from ${reply.to}, so ${reply.san} can no longer capture it there.`;
    } else if (response) {
      alternative.move(response.san);
      original.move(reply.san);
      const originalCaptures = original
        .moves({ verbose: true })
        .filter((m) => m.to === reply.to && m.captured)
        .map((m) => m.from);
      const recapture = alternative
        .moves({ verbose: true })
        .find((m) => m.to === reply.to && m.captured && !originalCaptures.includes(m.from));
      if (recapture)
        defensiveIdea = `Against ${reply.san}, ${bestSan} makes ${recapture.san} available to capture the ${pieceName(reply.piece)} on ${reply.to}. This is a legal defensive resource, not a guarantee that every resulting exchange is favorable.`;
    }
  }
  if (defensiveIdea) better += ` ${defensiveIdea}`;
  if (
    !same &&
    good.evidence.plies === bad.evidence.plies &&
    good.evidence.materialChange > bad.evidence.materialChange
  ) {
    better += ` In the two shown ${good.evidence.plies}-half-move continuations, ${bestSan} preserves ${good.evidence.materialChange - bad.evidence.materialChange} more material points than ${move.san}, including recaptures.`;
  } else if (!same && good.steps[1]) {
    better += ` Against the engine reply ${good.named[1]}, follow ${good.evidence.notation}.`;
  }
  if (!same && good.evidence.materialChange > 0) better += ` ${good.evidence.summary}`;
  if (
    !same &&
    !good.rootIdea &&
    !defensiveIdea &&
    good.evidence.materialChange <= 0 &&
    !bestMates &&
    !allowsMate
  ) {
    better +=
      ' This is a search-backed preference; no specific positional advantage is proven by this short line.';
  }
  const lesson =
    allowsMate || missedMate || capture || bad.steps.some((s) => s.san.endsWith('+'))
      ? "Before moving, check your opponent's checks and captures. Replay the response line to see whether your king or valuable pieces need protection."
      : good.rootIdea
        ? 'Compare development, central activity, and king placement before choosing a quiet move. These features explain the idea, not the entire engine score.'
        : 'Compare both continuations and their evaluations. Do not assume every inaccuracy loses material; use Deeper analysis when the concrete reason is unclear.';
  return {
    why,
    better,
    lesson,
    limitation: `These are engine continuations, not a claim that every reply is forced. Evidence is limited to ${bad.evidence.plies} half-move${bad.evidence.plies === 1 ? '' : 's'} after the played move and ${good.evidence.plies} after the recommended move. Material uses pawn=1, knight/bishop=3, rook=5, queen=9; it is not the positional evaluation.`,
    played: bad.evidence,
    best: good.evidence,
  };
}
