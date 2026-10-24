import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Color } from 'chess.js';
import { Board } from './components/Board';
import { CoachingPanel } from './components/CoachingPanel';
import type { ReviewLine } from './components/CoachingPanel';
import { EXPLANATION_PLIES } from './core/coaching';
import { importGame, variation } from './core/game';
import type { Game } from './core/game';
import { GRADES, scoreText, summarize } from './core/analysis';
import type { Review } from './core/analysis';
import { openingName, positionFacts } from './core/insights';
import { clearCache } from './core/cache';
import { SAMPLE_PGN } from './core/sample';
import { useReview } from './useReview';

const gradeClass = (label: string) => label.toLowerCase();
const lossText = (value: number | null) =>
  value === null ? 'Pending' : `${(value * 100).toFixed(1)} pts`;

function PlayerReport({
  game,
  reviews,
  color,
  jump,
}: {
  game: Game;
  reviews: (Review | undefined)[];
  color: Color;
  jump: (index: number) => void;
}) {
  const summary = summarize(game, reviews, color);
  const side = color === 'w' ? 'White' : 'Black';
  const openingIndex = game.moves.findIndex((m) => m.phase !== 'Opening');
  const facts = positionFacts(
    game.positions[openingIndex === -1 ? game.moves.length : openingIndex],
    color,
  );
  return (
    <article className="player-report">
      <div className="report-heading">
        <span className={`player-dot ${color}`} />
        <h3>{game.headers[side] || side}</h3>
        <span className="muted">
          {summary.analyzed}/{summary.total} reviewed
        </span>
      </div>
      <div className="metric">
        <span>Average expected-score loss</span>
        <strong>{lossText(summary.averageLoss)}</strong>
      </div>
      <div className="grade-counts">
        {GRADES.map((grade) => (
          <div key={grade}>
            <span className={`grade-dot ${gradeClass(grade)}`} />
            {grade}
            <strong>{summary.counts[grade]}</strong>
          </div>
        ))}
      </div>
      <h4>Opening</h4>
      <p>
        {facts.developed} minor pieces off the home rank at the opening boundary. King on{' '}
        {facts.king}.{' '}
        {game.moves.filter((m) => m.color === color && m.san.startsWith('O-O')).length
          ? 'Castled during the game.'
          : 'No castling move in this game.'}
      </p>
      <h4>Tactics</h4>
      <p>
        {summary.checks} checks or mates and {summary.captures} captures played.{' '}
        {summary.counts.Miss} verified missed mating opportunities. Counts alone do not measure
        tactical skill.
      </p>
      <h4>Strategy</h4>
      <p>
        {facts.pawnFiles} files with doubled pawns at the opening boundary.{' '}
        {facts.openFiles.length
          ? `Open files: ${facts.openFiles.join(', ')}.`
          : 'No fully open files at that point.'}{' '}
        These are observations, not a positional score.
      </p>
      <h4>Phase review</h4>
      {summary.phases.map((p) => (
        <div className="phase-row" key={p.name}>
          <span>{p.name}</span>
          <span>
            {!p.total
              ? `No ${p.name.toLowerCase()} reached`
              : `${lossText(p.loss)} · ${p.analyzed}/${p.total}`}
          </span>
        </div>
      ))}
      <h4>Learning moments</h4>
      {summary.critical.length ? (
        summary.critical.map((r) => (
          <button className="learning-link" key={r.index} onClick={() => jump(r.index + 1)}>
            {game.moves[r.index].number}
            {color === 'w' ? '.' : '...'} {game.moves[r.index].san} — {r.label}; try {r.bestSan}
          </button>
        ))
      ) : (
        <p>
          {summary.analyzed < summary.total
            ? 'Run analysis to find critical moments.'
            : 'No major expected-score losses in the reviewed moves.'}
        </p>
      )}
    </article>
  );
}

export function App() {
  const [input, setInput] = useState(SAMPLE_PGN);
  const [repair, setRepair] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [importError, setImportError] = useState('');
  const [selected, setSelected] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [depth, setDepth] = useState(10);
  const [tab, setTab] = useState<'review' | 'compare'>('review');
  const [lineStep, setLineStep] = useState<number | null>(null);
  const [lineKind, setLineKind] = useState<ReviewLine>('best');
  const [storageMessage, setStorageMessage] = useState('');
  const moveList = useRef<HTMLDivElement>(null);
  const analysis = useReview(game, selected);
  const move = game?.moves[selected - 1];
  const review = analysis.reviews[selected - 1];
  const completed = analysis.reviews.filter(Boolean).length;
  const line =
    game && review
      ? variation(game.positions[selected - 1], review[lineKind].pv.slice(0, EXPLANATION_PLIES))
      : [];
  const preview = lineStep !== null && !!review;
  const boardFen = game
    ? preview
      ? lineStep === 0
        ? game.positions[selected - 1]
        : line[lineStep! - 1].fen
      : game.positions[selected]
    : undefined;
  const bestArrow = preview && lineStep! < line.length ? line[lineStep!] : undefined;
  const displayScore = review ? scoreText(review.played.score, move!.color) : null;
  const jump = (index: number) => {
    setSelected(index);
    setLineStep(null);
  };
  useEffect(() => {
    const container = moveList.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="step"]');
    if (container && active) {
      const top = active.offsetTop - container.offsetTop;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (top + active.offsetHeight > container.scrollTop + container.clientHeight) {
        container.scrollTop = top + active.offsetHeight - container.clientHeight;
      }
    }
  }, [selected]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement).tagName;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) ||
        !game ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        jump(Math.min(game.moves.length, selected + 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        jump(Math.max(0, selected - 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [game, selected]);

  const importPgn = () => {
    try {
      const parsed = importGame(input, repair);
      analysis.cancel();
      setGame(parsed);
      setSelected(0);
      setLineStep(null);
      setImportError('');
      setTab('review');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 800_000) {
      setImportError('File too large. Maximum upload is 800 KB and 200,000 characters.');
      return;
    }
    try {
      setInput(await file.text());
      setImportError('');
    } catch (error) {
      setImportError(
        `Could not read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    event.target.value = '';
  };
  const clear = async () => {
    if (!window.confirm('Clear locally cached engine reviews?')) return;
    try {
      await clearCache();
      setStorageMessage('Local analysis cache cleared.');
    } catch (error) {
      setStorageMessage(
        `Could not clear cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return (
    <div className="app">
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon" aria-hidden="true">
            &#9816;
          </span>
          <span>
            CHESS <b>LENS</b>
            <small>A clearer look at every move</small>
          </span>
        </a>
        <div className="privacy">
          <span className="online-dot" />
          LOCAL ANALYSIS<span className="privacy-detail">Your games stay on your device</span>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">YOUR GAME. A NEW PERSPECTIVE.</p>
            <h1>Every move has a story.</h1>
            <p className="muted">
              Replay your game. Find the turning points. Make your next move better.
            </p>
          </div>
          <span className="engine-chip">Powered by Stockfish 19 · lite</span>
        </section>
        <details className="import-panel" open={!game}>
          <summary>
            {game ? 'Import another game' : 'Start with a game'}
            <span>Paste PGN or choose a file</span>
          </summary>
          <div className="import-content">
            <label htmlFor="pgn">Game notation (PGN)</label>
            <textarea
              id="pgn"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              rows={7}
            />
            <label className="check-label">
              <input
                type="checkbox"
                checked={repair}
                onChange={(e) => setRepair(e.target.checked)}
              />
              Allow explicit repair of Markdown header links and incorrect move numbers. SAN moves
              are never changed.
            </label>
            <div className="import-actions">
              <button className="primary" onClick={importPgn}>
                Open game <span aria-hidden="true">&#8599;</span>
              </button>
              <label className="file-button">
                Choose PGN file
                <input
                  aria-label="Choose PGN file"
                  type="file"
                  accept=".pgn,.txt"
                  onChange={upload}
                />
              </label>
              <button
                className="text-button"
                onClick={() => {
                  setInput(SAMPLE_PGN);
                  setRepair(false);
                  setImportError('');
                }}
              >
                Use sample game
              </button>
              <span className="muted">Max 1,000 half-moves</span>
            </div>
            {importError && (
              <pre className="error" role="alert">
                {importError}
              </pre>
            )}
          </div>
        </details>
        {game && (
          <>
            {!!game.warnings.length && (
              <details className="notice">
                <summary>Import notes ({game.warnings.length}) — review repairs</summary>
                <ul>
                  {game.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            <section className="workspace">
              <div className="board-column">
                <div className="player-bar">
                  <span className={`player-dot ${flipped ? 'w' : 'b'}`} />
                  <strong>
                    {game.headers[flipped ? 'White' : 'Black'] || (flipped ? 'White' : 'Black')}
                  </strong>
                  <span className="muted">
                    {game.headers[flipped ? 'WhiteElo' : 'BlackElo'] || 'Unrated'}
                  </span>
                  <span className="player-side">{flipped ? 'WHITE' : 'BLACK'}</span>
                </div>
                <div className="board-area">
                  <div
                    className="eval-bar"
                    aria-label={`White evaluation: ${displayScore ?? 'not analyzed'}`}
                  >
                    <div
                      style={{
                        height: review
                          ? `${Math.max(3, Math.min(97, 50 - (review.played.score.kind === 'mate' ? Math.sign(review.played.score.value) * 47 : 45 * Math.tanh(review.played.score.value / 400)) * (move!.color === 'w' ? 1 : -1)))}%`
                          : '50%',
                      }}
                    />
                    <span>{preview ? 'PV' : (displayScore ?? '—')}</span>
                  </div>
                  <Board
                    fen={boardFen!}
                    flipped={flipped}
                    last={preview ? (lineStep! > 0 ? line[lineStep! - 1] : undefined) : move}
                    arrow={bestArrow}
                  />
                </div>
                <div className="player-bar">
                  <span className={`player-dot ${flipped ? 'b' : 'w'}`} />
                  <strong>
                    {game.headers[flipped ? 'Black' : 'White'] || (flipped ? 'Black' : 'White')}
                  </strong>
                  <span className="muted">
                    {game.headers[flipped ? 'BlackElo' : 'WhiteElo'] || 'Unrated'}
                  </span>
                  <span className="player-side">{flipped ? 'BLACK' : 'WHITE'}</span>
                </div>
                <nav className="board-controls" aria-label="Game navigation">
                  <button
                    aria-label="First position"
                    onClick={() => jump(0)}
                    disabled={selected === 0}
                  >
                    |&#8249;
                  </button>
                  <button
                    aria-label="Previous move"
                    onClick={() => jump(selected - 1)}
                    disabled={selected === 0}
                  >
                    &#8249;
                  </button>
                  <span>
                    {preview
                      ? `${lineKind === 'played' ? 'Response' : 'Alternative'} · ${lineStep}/${line.length}`
                      : `${selected} / ${game.moves.length}`}
                  </span>
                  <button
                    aria-label="Next move"
                    onClick={() => jump(selected + 1)}
                    disabled={selected === game.moves.length}
                  >
                    &#8250;
                  </button>
                  <button
                    aria-label="Last position"
                    onClick={() => jump(game.moves.length)}
                    disabled={selected === game.moves.length}
                  >
                    &#8250;|
                  </button>
                  <button
                    className="flip"
                    aria-label="Flip board"
                    onClick={() => setFlipped(!flipped)}
                  >
                    &#8645;
                  </button>
                </nav>
                <div className="timeline-card">
                  <div className="card-label">
                    GAME MOMENTUM <span>White perspective</span>
                  </div>
                  <div className="timeline" aria-label="Evaluation timeline">
                    {game.moves.map((m, i) => {
                      const r = analysis.reviews[i];
                      const raw = r
                        ? (r.played.score.kind === 'mate'
                            ? Math.sign(r.played.score.value) * 1000
                            : r.played.score.value) * (m.color === 'w' ? 1 : -1)
                        : 0;
                      const height = Math.max(2, Math.min(42, Math.abs(raw) / 12));
                      return (
                        <button
                          key={i}
                          aria-label={`Go to ${m.number}${m.color === 'w' ? '.' : '...'} ${m.san}`}
                          title={r ? scoreText(r.played.score, m.color) : 'Pending'}
                          onClick={() => jump(i + 1)}
                          className={`${selected === i + 1 ? 'selected' : ''} ${r ? 'evaluated' : ''}`}
                        >
                          <span style={{ height, top: raw >= 0 ? 44 - height : 44 }} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="timeline-labels">
                    <span>Opening</span>
                    <span>{openingName(game)}</span>
                    <span>{game.result}</span>
                  </div>
                </div>
              </div>
              <div className="review-column">
                <div className="review-tabs" role="tablist" aria-label="Review panels">
                  <button
                    id="review-tab"
                    role="tab"
                    aria-selected={tab === 'review'}
                    aria-controls="review-panel"
                    onClick={() => setTab('review')}
                  >
                    Move review
                  </button>
                  <button
                    id="compare-tab"
                    role="tab"
                    aria-selected={tab === 'compare'}
                    aria-controls="compare-panel"
                    onClick={() => setTab('compare')}
                  >
                    Player comparison
                  </button>
                </div>
                <div className="analysis-toolbar">
                  <label>
                    Quality
                    <select
                      aria-label="Analysis quality"
                      value={depth}
                      disabled={analysis.busy}
                      onChange={(e) => setDepth(Number(e.target.value))}
                    >
                      <option value={10}>Fast · depth 10</option>
                      <option value={14}>Deeper · depth 14</option>
                    </select>
                  </label>
                  {analysis.busy ? (
                    <button onClick={analysis.cancel}>Pause analysis</button>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => {
                        setLineStep(null);
                        void analysis.start(depth);
                      }}
                    >
                      {completed ? 'Run again' : 'Analyze game'}
                    </button>
                  )}
                </div>
                <div className="progress-block">
                  <div className="status-row">
                    <span role="status">{analysis.status}</span>
                    <span>
                      {completed}/{game.moves.length}
                    </span>
                  </div>
                  <progress
                    max={game.moves.length}
                    value={completed}
                    aria-label="Game analysis progress"
                  />
                </div>
                {analysis.error && (
                  <p className="error" role="alert">
                    {analysis.error}
                  </p>
                )}
                {analysis.warning && (
                  <p className="notice" role="alert">
                    {analysis.warning}
                  </p>
                )}
                {tab === 'review' ? (
                  <div role="tabpanel" id="review-panel" aria-labelledby="review-tab">
                    <article className="move-review" aria-live="polite">
                      <div className="card-label">
                        {move
                          ? `${move.color === 'w' ? 'WHITE' : 'BLACK'} TO REVIEW`
                          : 'THE STARTING POSITION'}
                        <span>{move?.phase ?? 'Ready when you are'}</span>
                      </div>
                      <div className="move-heading">
                        <h2>
                          {move
                            ? `${move.number}${move.color === 'w' ? '.' : '...'} ${move.san}`
                            : 'A fresh board.'}
                        </h2>
                        {review ? (
                          <span className={`badge ${gradeClass(review.label)}`}>
                            {review.label}
                          </span>
                        ) : (
                          <span className="pending">
                            {selected ? 'Not analyzed' : 'Start here'}
                          </span>
                        )}
                      </div>
                      <p>
                        {review?.explanation ??
                          (selected
                            ? 'Run analysis to review this move. You can continue exploring the game while the engine works.'
                            : 'Use Next to step through the game, or run a local engine review to discover your learning moments.')}
                      </p>
                      {review && (
                        <>
                          <div className="score-pair">
                            <div>
                              <small>Best line</small>
                              <strong>{scoreText(review.best.score, move!.color)}</strong>
                            </div>
                            <div>
                              <small>Played line</small>
                              <strong>{displayScore}</strong>
                            </div>
                            <div>
                              <small>Score loss</small>
                              <strong>{lossText(review.loss)}</strong>
                            </div>
                          </div>
                          <CoachingPanel
                            coaching={review.coaching}
                            bestSan={review.bestSan}
                            label={review.label}
                            preview={preview ? lineKind : null}
                            onShow={(kind) => {
                              setLineKind(kind);
                              setLineStep(kind === 'played' ? 1 : 0);
                            }}
                            onReturn={() => setLineStep(null)}
                          />
                          {preview && (
                            <div className="variation-panel">
                              <p>
                                {lineKind === 'played'
                                  ? `Opponent response after ${move!.san} (engine continuation, not necessarily the game)`
                                  : `Alternative from the position before ${move!.san}`}
                              </p>
                              <div className="pv-moves">
                                {line.map((m, i) => (
                                  <button
                                    className={lineStep === i + 1 ? 'active' : ''}
                                    key={i}
                                    onClick={() => setLineStep(i + 1)}
                                  >
                                    {m.san}
                                  </button>
                                ))}
                              </div>
                              <div className="variation-controls">
                                <button
                                  disabled={lineStep === 0}
                                  onClick={() => setLineStep(lineStep! - 1)}
                                >
                                  Previous in line
                                </button>
                                <button
                                  disabled={lineStep === line.length}
                                  onClick={() => setLineStep(lineStep! + 1)}
                                >
                                  Play next in line
                                </button>
                              </div>
                            </div>
                          )}
                          <p className="analysis-note">
                            Depth {review.depth} · model estimate, not human winning odds.{' '}
                            {review.label === 'Miss'
                              ? `Underlying severity: ${review.ordinary}. `
                              : ''}
                            Deeper review may change this grade.
                          </p>
                        </>
                      )}
                    </article>
                    <section className="moves-card">
                      <div className="card-label">
                        THE GAME <span>{game.headers.Event || 'Imported game'}</span>
                      </div>
                      <div className="moves-list" ref={moveList}>
                        {game.moves.map((m, i) => (
                          <button
                            key={i}
                            aria-label={`${m.number}${m.color === 'w' ? '.' : '...'} ${m.san}${analysis.reviews[i] ? ` ${analysis.reviews[i]!.label}` : ''}`}
                            aria-current={selected === i + 1 ? 'step' : undefined}
                            onClick={() => jump(i + 1)}
                            className={selected === i + 1 ? 'active' : ''}
                          >
                            <span className="move-number">
                              {m.number}
                              {m.color === 'w' ? '.' : '...'}
                            </span>
                            <b>{m.san}</b>
                            {analysis.reviews[i] && (
                              <span
                                className={`move-grade ${gradeClass(analysis.reviews[i]!.label)}`}
                                title={analysis.reviews[i]!.label}
                              >
                                {analysis.reviews[i]!.label}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div
                    role="tabpanel"
                    id="compare-panel"
                    aria-labelledby="compare-tab"
                    className="comparison"
                  >
                    <p className="analysis-note">
                      Original review metrics, not Chess.com Accuracy. Lower expected-score loss is
                      better. Partial reviews are not a complete comparison.
                    </p>
                    <PlayerReport
                      game={game}
                      reviews={analysis.reviews}
                      color="w"
                      jump={(i) => {
                        jump(i);
                        setTab('review');
                      }}
                    />
                    <PlayerReport
                      game={game}
                      reviews={analysis.reviews}
                      color="b"
                      jump={(i) => {
                        jump(i);
                        setTab('review');
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          </>
        )}
        <section className="method-card">
          <h3>Strong analysis. Honest explanations.</h3>
          <p>
            Best moves come from Stockfish. Grades use documented expected-score loss, not
            Chess.com’s proprietary rules. Great identifies a uniquely strong searched choice; Miss
            identifies a lost mating opportunity. Brilliant is a conservative direct-piece-sacrifice
            heuristic, verified with additional searches.
          </p>
          <p>
            All processing happens locally. Engine downloads need a connection on first load; no
            game is sent to a server. Endgame and strategy observations are descriptive, not a human
            coach’s assessment.
          </p>
        </section>
      </main>
      <footer>
        <span>
          CHESS LENS <span className="muted">/ Independent game review</span>
        </span>
        <div>
          <a
            href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1"
            target="_blank"
            rel="noreferrer"
          >
            Engine source
          </a>
          <a href={`${import.meta.env.BASE_URL}engine/COPYING.txt`}>GPLv3 notice</a>
          <button className="text-button" onClick={() => void clear()} disabled={analysis.busy}>
            Clear local cache
          </button>
        </div>
      </footer>
      {storageMessage && (
        <p className="storage-message" role="status">
          {storageMessage}
        </p>
      )}
    </div>
  );
}
