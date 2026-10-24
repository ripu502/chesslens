import { useId } from 'react';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { pieceName } from '../core/analysis';

interface Props {
  fen: string;
  flipped: boolean;
  last?: { from: string; to: string };
  arrow?: { from: string; to: string };
}
const GLYPHS = {
  w: { k: '\u2654', q: '\u2655', r: '\u2656', b: '\u2657', n: '\u2658', p: '\u2659' },
  b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
};

export function Board({ fen, flipped, last, arrow }: Props) {
  const chess = new Chess(fen);
  const marker = useId().replace(/:/g, '');
  const files = (flipped ? 'hgfedcba' : 'abcdefgh').split('');
  const ranks = (flipped ? '12345678' : '87654321').split('');
  const coordinate = (square: string) => ({
    x: files.indexOf(square[0]) + 0.5,
    y: ranks.indexOf(square[1]) + 0.5,
  });
  const start = arrow ? coordinate(arrow.from) : undefined;
  const end = arrow ? coordinate(arrow.to) : undefined;
  return (
    <div className="board-shell">
      <div className="chessboard" role="grid" aria-label="Chessboard">
        {ranks.map((rank, row) => (
          <div role="row" className="board-row" key={rank}>
            {files.map((file, column) => {
              const square = (file + rank) as Square;
              const piece = chess.get(square);
              const highlighted = last?.from === square || last?.to === square;
              return (
                <div
                  key={square}
                  role="gridcell"
                  aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${pieceName(piece.type)}` : ' empty'}`}
                  className={`square ${(row + column) % 2 ? 'dark' : 'light'} ${highlighted ? 'highlight' : ''}`}
                >
                  {column === 0 && (
                    <span className="rank-label" aria-hidden="true">
                      {rank}
                    </span>
                  )}
                  {piece && (
                    <span aria-hidden="true" className={`piece piece-${piece.color}`}>
                      {GLYPHS[piece.color][piece.type]}
                    </span>
                  )}
                  {row === 7 && (
                    <span className="file-label" aria-hidden="true">
                      {file}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {start && end && (
        <svg
          className="arrows"
          viewBox="0 0 8 8"
          role="img"
          aria-label={`Suggested move ${arrow!.from} to ${arrow!.to}`}
        >
          <defs>
            <marker
              id={marker}
              markerWidth="3"
              markerHeight="3"
              refX="2.4"
              refY="1.5"
              orient="auto"
            >
              <path d="M0,0 L3,1.5 L0,3 Z" fill="#e9a84a" />
            </marker>
          </defs>
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#e9a84a"
            strokeWidth=".14"
            strokeLinecap="round"
            markerEnd={`url(#${marker})`}
          />
        </svg>
      )}
    </div>
  );
}
