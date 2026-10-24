import type { Coaching, LineEvidence } from '../core/coaching';
import type { Grade } from '../core/analysis';

export type ReviewLine = 'best' | 'played';

function Evidence({ line }: { line: LineEvidence }) {
  return (
    <>
      <p className="evidence-line">{line.notation}</p>
      <p className="material-summary">{line.summary}</p>
      {line.facts.length > 0 && (
        <details className="line-evidence">
          <summary>See move-by-move evidence</summary>
          <ul>
            {line.facts.map((fact, index) => (
              <li key={index}>{fact}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function CoachingPanel({
  coaching,
  bestSan,
  label,
  preview,
  onShow,
  onReturn,
}: {
  coaching: Coaching;
  bestSan: string;
  label: Grade;
  preview: ReviewLine | null;
  onShow: (line: ReviewLine) => void;
  onReturn: () => void;
}) {
  const negative = ['Inaccuracy', 'Mistake', 'Blunder', 'Miss'].includes(label);
  return (
    <section className="coaching" aria-label="Move explanation">
      <div className="coaching-section played-explanation">
        <h3>
          {negative
            ? `Why this is ${label === 'Inaccuracy' ? 'an' : 'a'} ${label.toLowerCase()}`
            : 'What your move does'}
        </h3>
        <p>{coaching.why}</p>
        <Evidence line={coaching.played} />
        <button
          disabled={coaching.played.plies < 2}
          onClick={() => (preview === 'played' ? onReturn() : onShow('played'))}
        >
          {preview === 'played' ? 'Return to game' : 'Show opponent response'}
        </button>
      </div>
      <div className="coaching-section best-explanation">
        <h3>How {bestSan} helps</h3>
        <p>{coaching.better}</p>
        <Evidence line={coaching.best} />
        <button onClick={() => (preview === 'best' ? onReturn() : onShow('best'))}>
          {preview === 'best' ? 'Return to game' : 'Show best move'}
        </button>
      </div>
      <div className="coaching-lesson">
        <h4>Takeaway</h4>
        <p>{coaching.lesson}</p>
      </div>
      <p className="analysis-note">{coaching.limitation}</p>
    </section>
  );
}
