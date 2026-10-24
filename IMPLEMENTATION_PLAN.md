# Static Chess Game Analyzer: Design and Implementation Plan

## 1. Scope and product principles

Build a responsive static web application that accepts a PGN game, replays it
move by move, evaluates both players, and explains important alternatives.
No backend, account, API key, or uploaded games are required.

The experience can be inspired by game-review products, but will use original
UI, assets, explanations, and documented classification rules. It will not
claim to reproduce Chess.com's proprietary grading or accuracy scores.

Implementation status: the initial release now includes replay, local WASM
analysis, all ordinary grades, conservative Great/Miss/Brilliant rules, legal
alternative playback, local caching, both-player summaries, and CI validation.
See README.md for exact implemented rules, commands, test results, and known
limits. Broad tactical motif detection and deeper strategic coaching remain
future enhancements; the UI currently reports evidence-backed observations.

## 2. Recommended stack

| Responsibility             | Recommendation                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Application                | React, TypeScript, Vite                                                                                                       |
| Chess rules, SAN, FEN, PGN | chess.js                                                                                                                      |
| Engine                     | Pinned Stockfish.js lite single-threaded WASM release                                                                         |
| Engine execution           | Dedicated Web Worker using UCI                                                                                                |
| Board                      | Maintained React board component with controlled position and arrows; verify accessibility, license, and API before selection |
| Unit/component tests       | Vitest, React Testing Library                                                                                                 |
| Browser tests              | Playwright                                                                                                                    |
| Persistence                | Versioned IndexedDB cache; optional local game storage                                                                        |
| Hosting                    | Static host such as Cloudflare Pages, Netlify, or GitHub Pages                                                                |

Self-host the engine JavaScript, WASM, and any required network assets. Resolve
asset URLs relative to Vite's deployment base so subdirectory hosting works.
The single-threaded build avoids requiring SharedArrayBuffer and cross-origin
isolation headers. Do not enable multithreading unless the host supports them.

Serve WASM with the correct MIME type. Verify licensing for all dependencies
and board assets. Stockfish is GPLv3: ship required notices and corresponding
source for the distributed build, and review license compatibility and
distribution obligations before publishing.

## 3. Screens and interaction design

### Import screen

- Paste PGN or select a local PGN file.
- Show player names, ratings, result, and import warnings.
- Offer a bundled example and an analysis-quality selector.
- Show engine download/loading progress separately from analysis progress.
- Support cancel and retry, including clear engine or parsing errors.

### Review screen

Desktop layout:

```text
+---------------------------+------------------------------------+
| White / Black player info | Review / Moves / Player comparison |
|                           |                                    |
| Evaluation bar + board    | 16. Qxd4  [classification]           |
|                           | Why this move matters              |
| Last move highlights      | Evaluation before -> after         |
| Suggested move arrows     | Best move + suggested continuation |
|                           |                                    |
| First Previous Next Last  | Clickable, annotated move list     |
| Flip board                |                                    |
+---------------------------+------------------------------------+
| Evaluation timeline and opening/tactics/strategy/endgame report |
+----------------------------------------------------------------+
```

On mobile, stack the board, navigation, explanation, and move list. Preserve
board size, touch targets, keyboard navigation, and readable explanations.
Labels must use text/icons as well as color.

Start at the initial position, or the PGN's legal SetUp/FEN starting position.
Next applies exactly one half-move; Previous restores the preceding position.
Selecting a move jumps directly to its resulting position and explanation.
Never show a pending move as analyzed.

### Arrow behavior

- Highlight the squares of the played move on its resulting board.
- For an inaccuracy, mistake, miss, or blunder, show the best alternative.
- "Show best move" switches to the position BEFORE the reviewed move and draws
  the suggested origin-to-destination arrow there.
- "Play line" steps through a legal engine continuation in a separate variation.
- "Return to game" restores the exact selected game position.
- Board flipping must preserve arrow coordinates and navigation state.

This avoids drawing a recommended move on a board where it is no longer legal.

## 4. PGN import and the supplied example

The supplied text is not clean exported PGN:

- Site and Link contain Markdown links inside PGN header values.
- The Rg1 turn is numbered 2 instead of 9.
- The Qxd4 turn is numbered 3 instead of 16.

Implement a conservative import pipeline:

1. Enforce a documented file-size and move-count limit.
2. Normalize whitespace and recognized Markdown links in header values only.
3. Attempt normal PGN parsing first.
4. If move numbering is inconsistent, offer an explicit repair preview that
   ignores those numbering tokens while preserving move order.
5. Validate every SAN move against the evolving position using chess.js.
6. Report the exact offending token and move index on failure. Never silently
   skip an illegal move or manufacture a replacement.
7. Preserve original input, normalized PGN, metadata, and repair warnings.

Support comments, NAGs, legal promotions, castling, en passant, and PGN starting
positions. Review the mainline only initially; imported side variations must
not be mistaken for played moves. Reject or explicitly select among multiple
games rather than concatenating them.

Check declared results against terminal positions where possible. Resignation,
time forfeits, and agreed draws need not end in a terminal board position.
Render all headers and comments as text, not HTML.

## 5. Engine and analysis architecture

Keep chess logic independent of React components:

- PGN module: normalization, validation, mainline extraction, warnings.
- Game model: immutable position timeline and navigation.
- Engine adapter: Worker lifecycle, UCI handshake, commands, parsing, cancellation.
- Analysis scheduler: foreground priority, background queue, progress, cache.
- Classifier: pure, versioned move-quality rules.
- Explanation module: evidence-backed chess motifs and message templates.
- Summary module: per-player and per-category aggregation.
- UI: board, arrows, move list, evaluation chart, review cards, comparison.

For each reviewed move, analyze the position before it, retaining the starting
position and full move history so repetition context is not lost.

1. Request MultiPV alternatives to identify the strongest candidate and assess
   whether there is only one good move.
2. If the played move is absent from those alternatives, use a constrained
   root search for that move. Absence from MultiPV is not proof of a blunder.
3. Compare completed searches at compatible quality; refine major mistakes and
   mate transitions before presenting a confident final label.
4. Retain best and played-move scores, depth, nodes, bounds, principal variation,
   engine identity, and classification-rule version.
5. Normalize scores to the moving player's perspective for grading and White's
   perspective for the evaluation chart.
6. Keep mate scores distinct from centipawns. Handle terminal states without
   requesting an impossible best move.

Use UCI WDL output where supported to derive model expected score:
P(win) + 0.5 * P(draw). Clearly describe this as an engine-model estimate,
not a calibrated probability for either human player. Any alternative score
mapping must be documented and independently versioned.

Serialize UCI work, wait for the proper completion boundaries, and prevent
late output from an old game or cancelled search updating a new review.
Prioritize the selected position. Bound Worker memory and CPU use.

Offer Fast and Deeper analysis budgets, with measured limits selected during
implementation. Display actual completed depth and provisional status rather
than promising a fixed duration or identical output across devices.

Cache only compatible results. Keys must include engine/network version,
analysis settings, rule version, and relevant position history, not just FEN.
Offer clear-cache controls. Explain storage failures; analysis may continue
in memory with an explicit warning.

## 6. Move classifications

Use expected-score loss from the moving player's perspective, with explicit,
unit-tested boundary behavior. These are this app's proposed defaults,
informed by Chess.com's published broad categories, not its complete algorithm.

| Ordinary category | Proposed rule                                  |
| ----------------- | ---------------------------------------------- |
| Best              | Played move matches the engine's top choice    |
| Excellent         | Other move with expected-score loss below 0.02 |
| Good              | Loss from 0.02 to below 0.05                   |
| Inaccuracy        | Loss from 0.05 to below 0.10                   |
| Mistake           | Loss from 0.10 to below 0.20                   |
| Blunder           | Loss of at least 0.20                          |

Display "Inaccuracy", the conventional category name, rather than "Inaccurate".
Tiny negative loss from search noise is not an improvement claim: reconcile
inconsistent searches before finalizing the result.

Special classifications need separate evidence:

- Great: a best or near-best move with a substantial gap to the next viable
  alternative in a critical position. Exclude positions with one legal move.
- Brilliant: a best or near-best move with a verified sound, nontrivial
  sacrifice. A hanging piece alone is insufficient. Verify legal acceptance
  and compensation through additional search; otherwise retain the ordinary
  label. This is explicitly a heuristic.
- Miss: a materially significant lost tactical opportunity, supported by a
  concrete continuation. Preserve the underlying mistake/blunder severity.

Define precedence explicitly: validated Brilliant, then Great, then supported
Miss, otherwise the ordinary grade. Never hide severity or fabricate a special
label to ensure every category appears in every game.

Mate transitions require dedicated rules and tests. Do not classify a forced
mate as an ordinary arbitrary centipawn value.

## 7. Explanations and comparison

Use deterministic templates backed by legal positions and verified engine
lines. No external language-model service is needed.

For each important move show:

- Player, SAN, category, and completed analysis quality.
- What changed and the concrete evidence.
- Best alternative and a short legal continuation.
- A concise actionable lesson, avoiding claims of certainty at low depth.

Reports for BOTH players:

| Area     | Evidence                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Opening  | Recognized line from a licensed local opening dataset, development, king safety, opening-phase errors         |
| Tactics  | Detected checks, forks, pins, hanging material, mating opportunities, and verified missed chances             |
| Strategy | Observable pawn structure, open files, piece activity, king safety, supported by position features            |
| Endgame  | Explicit phase detection, king activity, promotion races, conversion errors when an endgame actually occurred |

Opening name recognition is not the same as judging a move good. Do not invent
an opening name or classify every opening move as Best.
Document phase boundaries. If the game never reaches an endgame, display
"No endgame reached", not a zero or fabricated score.

Compare move-category counts, average expected-score loss, critical mistakes,
missed opportunities, and phase-specific strengths. If an aggregate accuracy
index is added, publish its formula and identify it as this app's index, not
Chess.com's Accuracy or an estimated Elo. Low sample sizes must remain visible.

## 8. Implementation milestones

1. Foundation and replay:
   Scaffold app; implement tested import/repair; board and complete navigation;
   support supplied example and custom starting positions.
2. Local engine:
   Add licensed engine assets, Worker adapter, progress/error/cancel states,
   bounded scheduler, evaluation timeline, and compatible result caching.
3. Move review:
   Implement ordinary grading, best alternatives, arrows, separate variations,
   and confidence/depth display.
4. Coaching and comparison:
   Add verified special grades, tactic detection, opening recognition, phase
   summaries, and balanced reports for both players.
5. Release:
   Responsive/accessibility pass, static-host checks, license notices,
   documentation, CI, production build, and browser verification.

Start with milestones 1-3 as a useful MVP. Do not ship speculative Brilliant
or strategy explanations as if they were validated engine facts.

## 9. Testing and acceptance criteria

Write failing unit tests before each implementation slice. Keep engine
transcripts and fixtures deterministic; mock Workers, storage, and timing in
unit tests. Use a separate real-WASM browser smoke test for integration.
Target at least 80% coverage on new code.

Required acceptance checks:

- Supplied game imports after an explicit repair and replays every legal move.
- First/Previous/Next/Last and direct selection produce identical positions.
- Castling, promotion, en passant, FEN starts, draw rules, and checkmate work.
- Both players' score perspectives and every grading threshold are tested.
- Equal alternatives, forced moves, mate transitions, and incomplete searches
  cannot manufacture Brilliant/Great/Blunder labels.
- Suggested arrows and all displayed continuations are legal from their
  displayed position, including flipped boards.
- Starting a new game or cancelling cannot leak stale engine results.
- Invalid PGN, engine load failure, storage failure, and unsupported WASM have
  visible, actionable errors.
- Endgame-free games and unmatched openings are reported honestly.
- Production assets load from a static-host subdirectory without a backend.
- Keyboard-only and mobile review remain usable.

The README will document setup, test/build commands, deployment, engine download
requirements, privacy, supported browsers, grading formulas, quality tradeoffs,
cache controls, and license/source distribution details.

## 10. Research references

- [Chess.com move classification explanation](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc)
- [Chess.com Game Review overview](https://support.chess.com/en/articles/8584089-how-does-game-review-work)
- [Stockfish.js: browser engine, build choices, UCI, and licensing](https://github.com/nmrugg/stockfish.js)
- [chess.js: chess rules and PGN tooling](https://github.com/jhlywa/chess.js)
- [ChessCom's older native Stockfish fork](https://github.com/ChessCom/stockfish)

Stockfish.js explicitly describes itself as written for Chess.com's in-browser
engine and maintained as a general-purpose project. It is the more direct
starting point for this static application than the older native C++ fork.
