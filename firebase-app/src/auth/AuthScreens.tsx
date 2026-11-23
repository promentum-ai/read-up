import { useState } from 'react'
import { friendlyAuthError, useAuth } from './AuthProvider'

export function LoadingScreen({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="app-shell">
      <p className="muted" style={{ textAlign: 'center', marginTop: '4rem' }}>
        {text}
      </p>
    </div>
  )
}

export function SignInScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await fn()
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    run(() =>
      mode === 'signin'
        ? signInWithEmail(email.trim(), password)
        : signUpWithEmail(email.trim(), password, name),
    )
  }

  function forgot() {
    if (!email.trim()) {
      setError('Enter your email above, then click “Forgot password?”.')
      return
    }
    run(async () => {
      await resetPassword(email.trim())
      setInfo('If an account exists for that email, a reset link is on its way.')
    })
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420 }}>
      <h1 style={{ textAlign: 'center' }}>SAT Reading &amp; Writing Tutor</h1>
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className={mode === 'signin' ? 'primary' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button className={mode === 'signup' ? 'primary' : ''} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>

        <button onClick={() => run(signInWithGoogle)} disabled={busy}>
          Continue with Google
        </button>
        <div className="muted" style={{ textAlign: 'center' }}>
          or use email
        </div>

        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {mode === 'signin' && (
          <button type="button" onClick={forgot} disabled={busy} style={{ border: 'none' }}>
            Forgot password?
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
        {info && <p className="muted">{info}</p>}
      </div>
    </div>
  )
}

export function VerifyEmailScreen() {
  const { state, resendVerification, refreshVerification, signOut } = useAuth()
  const [cooldown, setCooldown] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const email = state.status === 'unverified' ? state.user.email : ''

  async function resend() {
    setCooldown(true)
    setTimeout(() => setCooldown(false), 60_000)
    try {
      await resendVerification()
      setMsg('Verification email sent.')
    } catch (e) {
      setMsg(friendlyAuthError(e))
    }
  }

  async function check() {
    setMsg(null)
    await refreshVerification()
    setMsg('Not verified yet — open the link in the email we sent, then try again.')
  }

  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="card stack" style={{ textAlign: 'center' }}>
        <h2 style={{ margin: 0 }}>Verify your email</h2>
        <p className="muted">
          We sent a verification link to <strong>{email}</strong>. Open it, then come back here.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={check}>
            I’ve verified — continue
          </button>
          <button onClick={resend} disabled={cooldown}>
            Resend email
          </button>
          <button onClick={signOut}>Sign out</button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  const { retry, signOut } = useAuth()
  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <div className="card stack" style={{ textAlign: 'center' }}>
        <p className="error-text">{message}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={retry}>
            Retry
          </button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  )
}
