import type { Color } from 'chess.js';

export type Score = { kind: 'cp' | 'mate'; value: number };
export interface EngineLine {
  depth: number;
  nodes: number;
  multipv: number;
  score: Score;
  wdl?: [number, number, number];
  pv: string[];
}

export function parseInfo(text: string): EngineLine | null {
  if (!text.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(text)) return null;
  const score = /\bscore (cp|mate) (-?\d+)/.exec(text);
  const depth = /\bdepth (\d+)/.exec(text);
  const pv = /\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/.exec(text);
  if (!score || !depth || !pv) return null;
  const wdl = /\bwdl (\d+) (\d+) (\d+)/.exec(text);
  return {
    depth: Number(depth[1]),
    nodes: Number(/\bnodes (\d+)/.exec(text)?.[1] ?? 0),
    multipv: Number(/\bmultipv (\d+)/.exec(text)?.[1] ?? 1),
    score: { kind: score[1] === 'cp' ? 'cp' : 'mate', value: Number(score[2]) },
    wdl: wdl ? [Number(wdl[1]), Number(wdl[2]), Number(wdl[3])] : undefined,
    pv: pv[1].trim().split(/\s+/),
  };
}

export function expectedScore(line: EngineLine): number {
  if (line.score.kind === 'mate') return line.score.value > 0 ? 1 : 0;
  if (!line.wdl || line.wdl.some((n) => n < 0) || line.wdl.reduce((a, b) => a + b, 0) !== 1000) {
    throw new Error('Engine did not return valid WDL probabilities. Retry or reload the engine.');
  }
  return (line.wdl[0] + line.wdl[1] / 2) / 1000;
}

export function scoreText(score: Score, turn: Color): string {
  const value = score.value * (turn === 'w' ? 1 : -1);
  if (score.kind === 'mate') return `${value < 0 ? '-' : ''}M${Math.abs(value)}`;
  return `${value >= 0 ? '+' : ''}${(value / 100).toFixed(2)}`;
}
