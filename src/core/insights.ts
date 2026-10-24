import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Color } from 'chess.js';
import type { Game } from './game';
import { MATERIAL_VALUES } from './game';

const OPENINGS: [string, string][] = [
  ['e4', "King's Pawn Opening"],
  ['d4', "Queen's Pawn Opening"],
  ['c4', 'English Opening'],
  ['Nf3', 'Reti Opening'],
  ['e4 e5', 'Open Game'],
  ['e4 c5', 'Sicilian Defense'],
  ['e4 e6', 'French Defense'],
  ['e4 c6', 'Caro-Kann Defense'],
  ['e4 d5', 'Scandinavian Defense'],
  ['e4 e5 Nf3 d6', 'Philidor Defense'],
  ['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'],
  ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'],
  ['e4 e5 Nf3 Nf6', 'Petrov Defense'],
  ['d4 d5 c4', "Queen's Gambit"],
  ['d4 Nf6 c4 g6', "King's Indian setup"],
];

export function openingName(game: Game): string {
  if (game.positions[0] !== DEFAULT_POSITION) return 'Custom starting position';
  const moves = game.moves.map((m) => m.san).join(' ');
  return (
    [...OPENINGS]
      .sort((a, b) => b[0].length - a[0].length)
      .find(([line]) => moves === line || moves.startsWith(`${line} `))?.[1] ??
    'Unrecognized opening'
  );
}

export function positionFacts(fen: string, color: Color) {
  const allPieces = new Chess(fen).board().flat();
  const pieces = allPieces.filter((p) => p?.color === color);
  const pawns = pieces.filter((p) => p?.type === 'p');
  const files = 'abcdefgh'
    .split('')
    .map((file) => pawns.filter((p) => p?.square[0] === file).length);
  const home = color === 'w' ? '1' : '8';
  return {
    material: pieces.reduce((sum, p) => sum + (p ? MATERIAL_VALUES[p.type] : 0), 0),
    king: pieces.find((p) => p?.type === 'k')?.square,
    developed: pieces.filter((p) => p && ['b', 'n'].includes(p.type) && p.square[1] !== home)
      .length,
    pawnFiles: files.filter((count) => count > 1).length,
    openFiles: files.flatMap((count, i) =>
      !count && !allPieces.some((p) => p?.type === 'p' && p.square[0] === 'abcdefgh'[i])
        ? ['abcdefgh'[i]]
        : [],
    ),
  };
}
