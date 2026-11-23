import { useState } from 'react'
import { friendlyAuthError, useAuth } from '../auth/AuthProvider'

interface Props {
  onClose: () => void
}

export function EditProfileModal({ onClose }: Props) {
  const { state, saveProfile, deleteAccount } = useAuth()
  // Only rendered from the dashboard, which is only reachable when ready.
  const ready = state.status === 'ready' ? state : null
  const profile = ready!.profile
  const usesPassword = ready!.user.providerData.some((p) => p.providerId === 'password')

  const [name, setName] = useState(profile.name)
  const [masteryThreshold, setMasteryThreshold] = useState(profile.mastery_threshold)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await saveProfile({ name: trimmed, mastery_threshold: masteryThreshold })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    setError(null)
    try {
      await deleteAccount(usesPassword ? password : undefined)
    } catch (e) {
      setError(friendlyAuthError(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Edit profile</h2>

        <div className="stack">
          <label className="stack" style={{ gap: '0.3rem' }}>
            <span className="muted">Name</span>
            <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="weight-row" style={{ gridTemplateColumns: '1fr auto 3rem' }}>
            <span>Mastery threshold</span>
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={masteryThreshold}
              onChange={(e) => setMasteryThreshold(Number(e.target.value))}
            />
            <span className="value">{masteryThreshold}%</span>
          </div>
          <p className="muted" style={{ marginTop: '-0.4rem' }}>
            The accuracy a difficulty tier must reach (over at least 3 attempts) before it's
            considered mastered and sampling moves up to the next tier.
          </p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="row-between" style={{ marginTop: '1.25rem' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && !deleting ? 'Saving…' : 'Save'}
          </button>
        </div>

        <hr style={{ margin: '1.5rem 0 1rem', border: 0, borderTop: '1px solid var(--border)' }} />
        {!deleting ? (
          <button className="danger" onClick={() => setDeleting(true)}>
            Delete my account…
          </button>
        ) : (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              This permanently deletes your account, exams, and history. Type <strong>DELETE</strong>
              {usesPassword ? ' and enter your password' : ' (you’ll be asked to confirm with Google)'}{' '}
              to continue.
            </p>
            <input
              type="text"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            {usesPassword && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            <div className="row">
              <button
                className="danger"
                disabled={submitting || confirmText !== 'DELETE' || (usesPassword && !password)}
                onClick={handleDelete}
              >
                {submitting ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button onClick={() => setDeleting(false)}>Never mind</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
