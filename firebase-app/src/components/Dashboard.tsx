import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { api } from '../lib/api'
import type { BaselineMode, ExamHistoryEntry } from '../lib/types'
import { EditProfileModal } from './EditProfileModal'
import { WeightModal } from './WeightModal'

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function Dashboard() {
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const profile = state.status === 'ready' ? state.profile : null

  const [history, setHistory] = useState<ExamHistoryEntry[] | null>(null)
  const [hasCompleted, setHasCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [generatingMode, setGeneratingMode] = useState<BaselineMode | null>(null)

  const refresh = useCallback(() => {
    Promise.all([api.getExams(), api.hasCompletedExam()])
      .then(([h, c]) => {
        setHistory(h)
        setHasCompleted(c)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(refresh, [refresh])

  const active = (history ?? []).find((e) => e.status !== 'completed')

  async function handleFirstExam(mode: BaselineMode) {
    setGeneratingMode(mode)
    setError(null)
    try {
      const exam = await api.createBaselineExam(mode)
      navigate(`/exam/${exam.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGeneratingMode(null)
    }
  }

  function handleRowClick(entry: ExamHistoryEntry) {
    navigate(entry.status === 'completed' ? `/results/${entry.id}` : `/exam/${entry.id}`)
  }

  if (!profile) return null

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <h1>{profile.name}</h1>
          {profile.email && <div className="muted">{profile.email}</div>}
        </div>
        <div className="row">
          <button onClick={() => setShowEditModal(true)}>Edit Profile</button>
          {hasCompleted && (
            <button
              className="primary"
              onClick={() => setShowWeightModal(true)}
              disabled={!!active}
              title={active ? 'Finish your current exam first' : undefined}
            >
              Generate New Test
            </button>
          )}
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {active && (
        <div className="card row-between" style={{ marginBottom: '1rem' }}>
          <span>
            You have an exam {active.status === 'in_progress' ? 'in progress' : 'ready to start'}.
          </span>
          <button className="primary" onClick={() => handleRowClick(active)}>
            {active.status === 'in_progress' ? 'Resume exam' : 'Open exam'}
          </button>
        </div>
      )}

      {history === null ? (
        <p className="muted">Loading history…</p>
      ) : history.length === 0 ? (
        <div className="card empty-state stack" style={{ alignItems: 'center' }}>
          <p style={{ margin: 0 }}>Welcome! Choose how to start your first exam:</p>
          <div className="row">
            <button
              className="primary"
              onClick={() => handleFirstExam('random')}
              disabled={generatingMode !== null}
            >
              {generatingMode === 'random' ? 'Generating…' : 'Random'}
            </button>
            <button onClick={() => handleFirstExam('easy_only')} disabled={generatingMode !== null}>
              {generatingMode === 'easy_only' ? 'Generating…' : 'Easy Only'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Score</th>
                <th>Per-skill breakdown</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} onClick={() => handleRowClick(entry)} style={{ cursor: 'pointer' }}>
                  <td>{formatDate(entry.created_at)}</td>
                  <td>{entry.type === 'baseline' ? 'Baseline' : 'Generated'}</td>
                  <td>{entry.status.replace('_', ' ')}</td>
                  <td>
                    {entry.score
                      ? `${entry.score.correct}/${entry.score.total} (${entry.score.percentage}%)`
                      : '—'}
                  </td>
                  <td>
                    <div className="skill-breakdown">
                      {entry.per_skill.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        entry.per_skill.map((s) => (
                          <span
                            className="skill-chip"
                            key={s.skill}
                            title={
                              s.avg_time_spent_seconds != null
                                ? `avg ${Math.round(s.avg_time_spent_seconds)}s/question`
                                : undefined
                            }
                          >
                            {s.skill}: {s.correct}/{s.attempted}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showWeightModal && (
        <WeightModal
          onClose={() => setShowWeightModal(false)}
          onGenerated={(exam) => {
            setShowWeightModal(false)
            navigate(`/exam/${exam.id}`)
          }}
        />
      )}

      {showEditModal && <EditProfileModal onClose={() => setShowEditModal(false)} />}
    </div>
  )
}
