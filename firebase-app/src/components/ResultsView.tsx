import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Results } from '../lib/types'

interface Props {
  examId: string
  onBack: () => void
}

export function ResultsView({ examId, onBack }: Props) {
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getResults(examId)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [examId])

  if (error) {
    return (
      <div className="app-shell">
        <button onClick={onBack}>&larr; Back</button>
        <p className="error-text">{error}</p>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="app-shell">
        <p className="muted">Loading results…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-header">
        <button onClick={onBack}>&larr; Back to dashboard</button>
      </div>

      <div className="card score-hero">
        <div className="percentage">{results.score.percentage}%</div>
        <div className="muted">
          {results.score.correct} of {results.score.total} correct
        </div>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Per-skill breakdown</h2>
      <div className="card">
        <table className="history-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Domain</th>
              <th>Correct</th>
              <th>Accuracy</th>
              <th>Avg time</th>
            </tr>
          </thead>
          <tbody>
            {results.per_skill.map((s) => (
              <tr key={s.skill}>
                <td>{s.skill}</td>
                <td>{s.domain}</td>
                <td>
                  {s.correct}/{s.attempted}
                </td>
                <td>{s.accuracy}%</td>
                <td>
                  {s.avg_time_spent_seconds != null
                    ? `${Math.round(s.avg_time_spent_seconds)}s`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Full review</h2>
      {results.review.map((q) => (
        <div className="review-item" key={q.id}>
          <div className="review-header">
            <span>
              Question {q.position + 1} &middot; {q.skill} &middot; {q.difficulty}
              {q.time_spent_seconds != null && <> &middot; {q.time_spent_seconds}s spent</>}
            </span>
            <span
              className={`result-badge ${
                q.skipped ? 'unanswered' : q.is_correct ? 'correct' : 'incorrect'
              }`}
            >
              {q.skipped ? 'Skipped' : q.is_correct ? 'Correct' : 'Incorrect'}
            </span>
          </div>
          {q.passage && <div className="passage">{q.passage}</div>}
          <div className="stem">{q.stem}</div>
          <div className="choice-list">
            {Object.entries(q.choices).map(([letter, text]) => {
              const isCorrectChoice = letter === q.correct_choice
              const isSelected = letter === q.selected_choice
              const cls = isCorrectChoice ? 'correct' : isSelected ? 'incorrect' : ''
              return (
                <div key={letter}>
                  <div className={`choice ${cls}`.trim()}>
                    <span className="letter">{letter}</span>
                    <span>
                      {text}
                      {isSelected && ' (your answer)'}
                    </span>
                  </div>
                  <div className="explanation">{q.explanations[letter]}</div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
