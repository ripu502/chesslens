# Chess Lens

A static, private chess game analyzer built with React, TypeScript, chess.js,
and Stockfish 19 lite single-threaded WASM. Paste a PGN, replay either player's
moves, review engine-backed grades, and explore better moves with arrows.

## Quickstart

Use Node.js 24 or newer and npm. On Windows PowerShell, use `npm.cmd` if
execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Installation copies the pinned engine JavaScript, WASM, and GPL notice from the
installed npm package to `public/engine`. No external engine API is used.
If those assets need regenerating, run `npm run engine:prepare`.

## Using the review

1. Paste PGN or choose a local `.pgn` file and select **Open game**.
2. For the supplied sample, explicitly enable repair of Markdown header links
   and incorrect move numbers. Review the import notes. SAN is never repaired.
3. Start at the initial position. Use First, Previous, Next, Last, the move
   list, the timeline, or Left/Right keys when focus is outside form controls.
4. Select **Analyze game**. Navigation remains available while Stockfish runs
   in a Worker. Fast uses depth 10; Deeper uses depth 14. Important errors and
   mate transitions receive an additional two plies of verification.
5. **Show best move** displays the position BEFORE the reviewed move and draws
   the recommended arrow. Step through the alternative, then **Return to game**.
   **Show opponent response** instead starts immediately AFTER your move,
   showing the engine's reply and allowing you to replay the punishment.
6. Open **Player comparison** for both players' category counts, average loss,
   phase summaries, position observations, and critical learning moments.

The PGN importer validates the entire mainline, including FEN starts, castling,
promotion, and en passant. Comments, NAGs, and side variations are excluded
from the review. One game per import, at most 200,000 characters / 1,000
half-moves. Uploaded files also have an 800 KB byte limit. Illegal moves
produce an explicit error with the offending token and half-move.

## Grading methodology and limitations

This is an independent review tool, not a reproduction of Chess.com's grading.
There is no claim of measured agreement with Chess.com.

Stockfish's WDL output gives an engine-model expected score:

```text
expected score = (win + draw / 2) / 1000
loss = best move expected score - played move expected score
```

Both searches use the moving player's perspective. Scores displayed on the
board and timeline always use White's perspective. Mate scores remain distinct
from centipawns. WDL is NOT a calibrated winning probability for a human player.

| Label      | Rule                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Best       | Played move is the engine's top searched choice                                                               |
| Excellent  | Another move with loss below 0.02                                                                             |
| Good       | Loss >= 0.02 and < 0.05                                                                                       |
| Inaccuracy | Loss >= 0.05 and < 0.10                                                                                       |
| Mistake    | Loss >= 0.10 and < 0.20                                                                                       |
| Blunder    | Loss >= 0.20                                                                                                  |
| Great      | Best move, more than one legal move, expected score >= 0.4, gap >= 0.25 to second searched candidate          |
| Miss       | A searched forced mate was missed, played expected score < 0.9, loss >= 0.05; underlying severity is retained |
| Brilliant  | Conservative sound direct-piece-sacrifice heuristic, described below                                          |

Brilliant requires a near-best move (loss < 0.02), a position not already
overwhelmingly winning (best expected score < 0.9), and played expected score

> = 0.45. It excludes pawn/king sacrifices and equal exchanges. A legal opponent
> capture must be able to accept the offered piece for a net sacrifice of at
> least two material points. Root analysis is refined to at least depth 14;
> every legal acceptance gets a constrained search at at least depth 14.
> Each acceptance must give the opponent expected score <= 0.55, and its legal
> continuation must retain a material deficit of at least two points over up to
> six plies. Short/incomplete continuations are rejected unless they prove mate
> against the accepting side. This intentionally misses many genuine brilliancies,
> including indirect sacrifices, and is not a proof of soundness at arbitrary depth.

Special-label precedence: Brilliant, Great, Miss, then ordinary grade.
Only one legal move is never Great or Brilliant. No rating-based adjustment is
applied. Near-identical alternatives and shallow searches can receive different
labels after deeper analysis. Missing played moves are evaluated with a root
restriction, never graded from their absence in MultiPV.

If the played move appears better than the purported best by more than 0.005
expected score, searches are refined. Persistently inconsistent results stop
the review with an actionable error instead of inventing a grade. Smaller
negative differences are treated as search noise and clamped to zero.

Average expected-score loss is a transparent metric, not Chess.com Accuracy,
an Elo estimate, or a measure of human win probability. In decisively lost
positions, WDL saturation can make even materially costly moves lose little
additional expected score. Read the actual continuation, not just the badge.

### Coaching scope

- Every reviewed move includes **What your move does** (or **Why this is an
  inaccuracy/mistake/blunder/miss**), **How the recommended move helps**, and a
  practical takeaway. These use legal continuations for both choices, not just
  the score difference.
- Explanations name the opponent's reply, checks, material captures with their
  squares, promotions, and check-and-piece forks followed by a capture in the
  returned line. A capture is not automatically called a lost piece: net
  material accounts for recaptures and promotions.
- Both lines show numbered notation, net material changes, and expandable
  move-by-move evidence. Material is compared only across equal-length excerpts,
  limited to ten half-moves. This is a comparison of those continuations,
  not proof that every reply is forced or that material alone explains the score.
- The alternative can explain a newly available legal recapture against the
  same opponent reply, or moving a threatened piece away. A legal defensive
  resource is not automatically described as a favorable exchange.
- Quiet alternatives can identify concrete development, castling, and central
  activity. If a short PV does not establish a tactical cause, the UI explicitly
  says so rather than inventing a positional justification; use Deeper analysis
  for more evidence. Engine-detected mates are distinguished from ordinary checks.
- Opening names use a small original, local table of common mainline prefixes;
  no online opening service or exhaustive ECO database is included. Custom
  positions and unmatched openings are labeled honestly.
- Opening ends after move 10, unless the position already qualifies as an
  endgame. Endgame begins when at most two queens/rooks combined and at most
  two bishops/knights combined remain. This is a documented heuristic.
- Tactics include checks, captures, verified missed mating lines, direct
  sacrifices, and check-and-piece forks supported by a subsequent capture.
  General fork, pin, and skewer recognition is not yet implemented.
- Strategy reports observable piece development, doubled pawns, king location,
  and open files at the opening boundary, not unsupported strategic judgments.
- Endgame reports actual phase coverage and engine losses. Games without an
  endgame say **No endgame reached**. Partial reviews show sample counts.

## Architecture

- `src/core/game.ts`: conservative PGN import, legal timeline and PV playback.
- `src/core/engine.ts`: UCI Worker handshake, serialized searches, timeouts and cancellation.
- `src/core/engine-score.ts`: UCI scores, WDL expectations, and perspective conversion.
- `src/core/analysis.ts`: scores, grading, evidence-backed explanations and summaries.
- `src/core/coaching.ts`: legal-line evidence, tactical consequences, defensive
  resources, material comparisons, and best-move explanations.
- `src/core/sacrifice.ts`: constrained acceptance searches for direct sacrifices.
- `src/core/reviewer.ts`: selected-position priority and compatible cache orchestration.
- `src/core/cache.ts`: versioned IndexedDB analysis cache.
- `src/core/insights.ts`: opening prefixes and observable board facts.
- `src/useReview.ts`: review lifecycle and stale-output protection.
- `src/components/Board.tsx`: accessible read-only board and coordinate-stable SVG arrows.
- `src/components/CoachingPanel.tsx`: played-vs-recommended explanations and line controls.
- `src/App.tsx`: PGN import and responsive review UI.

The read-only board is implemented locally rather than adding a board package:
this app needs replay and arrows, not drag/drop or gameplay. It uses system chess
glyphs, so piece appearance varies by OS. No externally hosted fonts/assets.

## Privacy, storage and resource use

There are no accounts, telemetry, API keys, or backend. PGN is not uploaded.
The browser requests static application and engine assets from the host.
External source/license links only navigate when selected.

IndexedDB stores position history, searched moves, and reviews locally; it does
not save original PGN headers. Cache keys include engine build, grading-rule
version, depth, full position history, and played move. The footer's
**Clear local cache** deletes cached analysis. Storage failure produces a visible
warning and allows analysis to continue in memory.

One engine Worker uses one thread and 32 MB hash. Analysis time depends on
hardware and positions; no fixed duration is promised. Pause terminates the
Worker and retains completed results. Starting another game cancels old work.
Restart uses compatible cached results. The engine is loaded only when analysis
is requested. There is no service worker/offline-install guarantee.

## Validation

```sh
npm test
npm run coverage
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Unit tests use fake Workers, deterministic engine transcripts, fake IndexedDB,
and isolated browser APIs. Coverage enforces at least 80% lines, statements,
branches, and functions. Browser integration tests run the actual self-hosted
WASM engine for the supplied game on desktop and mobile Chromium, and exercise
navigation, arrows, cancellation, and both-player summaries.

Generated HTML/JSON coverage reports are written under
`node_modules/.cache/chess-lens-coverage`, outside workspace source watchers.

The GitHub Actions workflow runs formatting, coverage, typecheck/build,
dependency audit, and real-WASM browser tests on Node 24.

## Static deployment

### GitHub Pages

This repository is configured to deploy to
**https://ripu502.github.io/chesslens/** using GitHub Actions.

1. Open the repository's **Settings > Pages**.
2. Under **Build and deployment**, choose **GitHub Actions** as the source.
   Do not choose "Deploy from a branch".
3. Open **Actions > Validate and deploy Chess Lens**. If the first push ran
   before Pages was enabled, rerun the workflow, or select **Run workflow**
   on `main`.

Every push to `main` runs formatting, coverage, the production build, dependency
audit, and desktop/mobile browser tests. Only after they pass is the complete
`dist` artifact deployed, including the self-hosted engine. Pull requests are
validated but cannot deploy. No personal access token or deployment secret is
needed; the deployment job uses GitHub's scoped Pages and OIDC permissions.

The relative Vite base supports the `/chesslens/` project path without a custom
domain. The application has no client-side route paths requiring a 404 fallback.

### Other static hosts

```sh
npm ci
npm run build
```

Publish **all of `dist`**, including `engine`, to your static host. For local
production testing, use `npm run preview`. Vite's relative asset base supports
hosting under a directory such as `/review/`; browser tests exercise that base.
No environment variables or server-side secrets are required.

Serve `.js` as JavaScript and `.wasm` as `application/wasm`. No COOP/COEP
headers are needed for the single-threaded engine. Do not enable multithreading
without configuring cross-origin isolation. Use current Chromium, Firefox,
or Safari with WebAssembly, Web Workers, and IndexedDB. Chromium is automated;
Firefox/Safari still need release-device verification.

For hosts with CSP, permit same-origin scripts, Workers, and engine fetches,
WASM compilation (`wasm-unsafe-eval` where required), and the app's dynamic
inline styles. Test your exact policy rather than copying a broad permissive one.

## Licensing and release checklist

Stockfish.js 19.0.1 is GPLv3. The generated app includes the engine's GPL text
and a prominent link to its exact corresponding source:

- [Pinned engine source](https://github.com/nmrugg/stockfish.js/tree/v19.0.1)
- [Corresponding source archive](https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.1.tar.gz)
- [chess.js](https://github.com/jhlywa/chess.js): BSD-2-Clause.
- React: MIT. Vite and TypeScript licenses are available in installed packages.

No license for independently authored application code has been selected yet.
Before public redistribution, choose a compatible application license, include
all required notices, and verify GPLv3 source-availability obligations for your
distribution and any engine modifications. Do not assume a static build removes
those obligations. This project is private in npm.

## Release notes

### Unreleased

- Added concrete justifications and best-move benefits using both engine lines,
  with named captures, fork evidence, mate warnings, defensive resources,
  transparent material accounting, and quiet-move ideas.
- Added opponent-response playback with arrows, independent of best-line playback.
- Versioned the review cache for the new explanations; rerun analysis after updating.

### 0.1.0

- Local PGN import with explicit sample repair and legal mainline replay.
- Single-threaded Stockfish review, all nine category labels with conservative
  special rules, best-move arrows, and separate legal variation playback.
- Both-player summaries, opening identification, phase metrics, and transparent
  position observations.
- IndexedDB caching, cancellation, responsive layout, unit coverage gates,
  and desktop/mobile browser integration tests.
