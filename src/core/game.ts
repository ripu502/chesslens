import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';

export const MATERIAL_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function pieceName(piece: string): string {
  return { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece] ?? piece;
}

export interface GameMove {
  san: string;
  uci: string;
  from: Square;
  to: Square;
  color: Color;
  number: number;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  phase: 'Opening' | 'Middlegame' | 'Endgame';
}

export interface Game {
  original: string;
  pgn: string;
  headers: Record<string, string>;
  warnings: string[];
  positions: string[];
  moves: GameMove[];
  result: string;
}

function mainline(text: string): string {
  let output = '';
  let depth = 0;
  let comment = false;
  let semicolon = false;
  for (const char of text) {
    if (semicolon) {
      if (char === '\n') {
        semicolon = false;
        output += ' ';
      }
      continue;
    }
    if (comment) {
      if (char === '}') comment = false;
      continue;
    }
    if (char === '{') {
      comment = true;
      output += ' ';
    } else if (char === ';') semicolon = true;
    else if (char === '(') {
      depth++;
      output += ' ';
    } else if (char === ')') {
      if (!depth) throw new Error('Unmatched PGN variation closing bracket.');
      depth--;
    } else if (!depth) output += char;
  }
  if (comment) throw new Error('Unclosed PGN comment.');
  if (depth) throw new Error('Unclosed PGN variation.');
  return output;
}

export function phase(chess: Chess, moveNumber: number): GameMove['phase'] {
  const pieces = chess
    .board()
    .flat()
    .filter((p) => p !== null);
  const heavy = pieces.filter((p) => p.type === 'q' || p.type === 'r').length;
  const minor = pieces.filter((p) => p.type === 'b' || p.type === 'n').length;
  if (heavy <= 2 && minor <= 2) return 'Endgame';
  return moveNumber <= 10 ? 'Opening' : 'Middlegame';
}

export function importGame(original: string, allowRepair = false): Game {
  if (original.length > 200_000) throw new Error('PGN exceeds the 200,000 character limit.');
  const headers: Record<string, string> = {};
  const warnings: string[] = [];
  const input = original.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const headerPattern = /^\s*\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\s*\]\s*/;
  let body = input;
  while (headerPattern.test(body)) {
    const match = headerPattern.exec(body)!;
    if (headers[match[1]] !== undefined)
      throw new Error('Duplicate headers or multiple PGN games. Import one game at a time.');
    const value = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const normalized = value.replace(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/, '$1');
    if (normalized !== value) warnings.push(`Repair ${match[1]}: remove Markdown link formatting.`);
    headers[match[1]] = normalized;
    body = body.slice(match[0].length);
  }
  if (headers.SetUp === '1' && !headers.FEN) throw new Error('SetUp requires a FEN header.');
  if (headers.FEN && headers.SetUp !== '1') throw new Error('A FEN header requires SetUp "1".');
  let chess: Chess;
  try {
    chess = new Chess(headers.FEN ?? DEFAULT_POSITION);
  } catch (error) {
    throw new Error(
      `Invalid starting FEN: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const initial = chess.fen();
  const moves: GameMove[] = [];
  const positions = [initial];
  let result = '*';
  let ended = false;
  const stripped = mainline(body);
  if (stripped.includes('['))
    throw new Error('Unexpected headers or multiple games. Import one game at a time.');
  const tokens = stripped
    .replace(/\$\d+/g, ' ')
    .replace(/(\d+\.(?:\.\.)?)/g, ' $1 ')
    .trim()
    .split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    if (ended)
      throw new Error('Multiple games or moves after the result. Import one game at a time.');
    const number = /^(\d+)\.(\.\.)?$/.exec(token);
    if (number) {
      const expected = Number(chess.fen().split(' ')[5]);
      if (
        Number(number[1]) !== expected ||
        (number[2] && chess.turn() !== 'b') ||
        (!number[2] && chess.turn() !== 'w')
      ) {
        warnings.push(
          `Repair numbering before half-move ${moves.length + 1}: ${token} should be ${expected}${chess.turn() === 'w' ? '.' : '...'}`,
        );
      }
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
      result = token;
      ended = true;
      continue;
    }
    if (/^[!?]+$/.test(token)) continue;
    if (moves.length >= 1000) throw new Error('PGN exceeds the 1,000 half-move limit.');
    const numberBefore = Number(chess.fen().split(' ')[5]);
    const phaseBefore = phase(chess, numberBefore);
    try {
      const m = chess.move(token.replace(/[!?]+$/, ''), { strict: true });
      moves.push({
        san: m.san,
        uci: m.from + m.to + (m.promotion ?? ''),
        from: m.from,
        to: m.to,
        piece: m.piece,
        captured: m.captured,
        color: m.color,
        number: numberBefore,
        phase: phaseBefore,
      });
      positions.push(chess.fen());
    } catch {
      throw new Error(
        `Illegal move "${token}" at half-move ${moves.length + 1}. No moves were skipped.`,
      );
    }
  }
  if (!moves.length) throw new Error('PGN contains no moves.');
  const repairs = warnings.filter((w) => w.startsWith('Repair'));
  if (repairs.length && !allowRepair)
    throw new Error(
      `PGN repair required:\n${repairs.join('\n')}\nEnable the repair preview and import again.`,
    );
  if (headers.Result && result !== '*' && headers.Result !== result)
    warnings.push('Header result differs from movetext result.');
  result = result === '*' ? (headers.Result ?? '*') : result;
  if (chess.isCheckmate()) {
    const actual = chess.turn() === 'w' ? '0-1' : '1-0';
    if (result !== actual)
      warnings.push(`Declared result ${result} conflicts with checkmate (${actual}).`);
  } else if (chess.isDraw() && result !== '1/2-1/2') {
    warnings.push('Declared result differs from the drawn final position.');
  }
  chess.header(...Object.entries({ ...headers, Result: result }).flat());
  return { original, pgn: chess.pgn(), headers, warnings, positions, moves, result };
}

export function variation(
  fen: string,
  pv: string[],
): {
  san: string;
  fen: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
}[] {
  const chess = new Chess(fen);
  return pv.map((uci) => {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return {
        san: move.san,
        fen: chess.fen(),
        from: move.from,
        to: move.to,
        color: move.color,
        piece: move.piece,
        captured: move.captured,
        promotion: move.promotion,
      };
    } catch {
      throw new Error(`Illegal engine continuation: ${uci}. Retry deeper analysis.`);
    }
  });
}

export function positionCommand(game: Game, index: number): string {
  const history = game.moves
    .slice(0, index)
    .map((m) => m.uci)
    .join(' ');
  return `position fen ${game.positions[0]}${history ? ` moves ${history}` : ''}`;
}
