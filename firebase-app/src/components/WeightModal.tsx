import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { DOMAINS } from '../lib/taxonomy'
import type { Exam } from '../lib/types'

interface Props {
  onClose: () => void
  onGenerated: (exam: Exam) => void
}

export function WeightModal({ onClose, onGenerated }: Props) {
  const [weights, setWeights] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api
      .getSuggestedWeights()
      .then((res) => setWeights(res.weights))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const allZero = weights !== null && Object.values(weights).every((w) => w === 0)

  function setWeight(skill: string, value: number) {
    setWeights((prev) => (prev ? { ...prev, [skill]: value } : prev))
  }

  async function handleSubmit() {
    if (!weights || allZero) return
    setSubmitting(true)
    setError(null)
    try {
      const exam = await api.createGeneratedExam(weights)
      onGenerated(exam)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Set category weights</h2>
        <p className="muted">
          Higher weight means more questions from that category. Weights are pre-filled from your
          past performance — lower accuracy suggests a higher weight.
        </p>

        {weights === null ? (
          <p className="muted">Loading suggested weights…</p>
        ) : (
          <div>
            {Object.entries(DOMAINS).map(([domain, skills]) => (
              <div className="domain-group" key={domain}>
                <h4>{domain}</h4>
                {skills.map((skill) => (
                  <div className="weight-row" key={skill}>
                    <span>{skill}</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={weights[skill] ?? 0}
                      onChange={(e) => setWeight(skill, Number(e.target.value))}
                    />
                    <span className="value">{weights[skill] ?? 0}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {allZero && (
          <p className="error-text">At least one category must have a weight greater than 0.</p>
        )}
        {error && <p className="error-text">{error}</p>}

        <div className="row-between" style={{ marginTop: '1.25rem' }}>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={handleSubmit}
            disabled={!weights || allZero || submitting}
          >
            {submitting ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
