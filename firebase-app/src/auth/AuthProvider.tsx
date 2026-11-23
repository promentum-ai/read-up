import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase'
import { loadQuestionBank, type QuestionBank } from '../bank'
import { deleteAllUserData, ensureProfile } from '../data/firestore'
import { api, setSession } from '../lib/api'
import type { Profile, ProfileUpdate } from '../lib/types'

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'unverified'; user: User }
  | { status: 'loadingData'; user: User }
  | { status: 'error'; user: User; message: string }
  | { status: 'ready'; user: User; profile: Profile; bank: QuestionBank }

interface AuthContextValue {
  state: State
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
  refreshVerification: () => Promise<void>
  signOut: () => Promise<void>
  retry: () => void
  saveProfile: (body: ProfileUpdate) => Promise<void>
  deleteAccount: (password?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

const isGoogle = (user: User) => user.providerData.some((p) => p.providerId === 'google.com')
const isVerified = (user: User) => user.emailVerified || isGoogle(user)

/** Maps Firebase error codes to plain language (SPEC §7.7). */
export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/email-already-in-use':
      'An account with that email already exists. Sign in instead (if you used Google before, use “Continue with Google”).',
    'auth/weak-password': 'Password must be at least 8 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/cancelled-popup-request': 'The sign-in window was closed before finishing.',
    'auth/account-exists-with-different-credential':
      'That email is already registered with a different sign-in method. Use your original method.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/requires-recent-login': 'Please confirm your identity and try again.',
  }
  if (map[code]) return map[code]
  if (e instanceof Error && !code) return e.message
  return 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setSession(null)
        setState({ status: 'signedOut' })
      } else if (!isVerified(user)) {
        setState({ status: 'unverified', user })
      } else {
        setState({ status: 'loadingData', user })
        Promise.all([
          ensureProfile(user.uid, user.email, user.displayName),
          loadQuestionBank(),
        ])
          .then(([profile, bank]) => {
            setSession({ uid: user.uid, email: user.email, bank, profile })
            setState({ status: 'ready', user, profile, bank })
          })
          .catch((e) =>
            setState({
              status: 'error',
              user,
              message: e instanceof Error ? e.message : 'Could not load your data.',
            }),
          )
      }
    })
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signUpWithEmail(email, password, name) {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.')
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) await updateAuthProfile(cred.user, { displayName: name.trim() })
        await sendEmailVerification(cred.user)
        // onAuthStateChanged fired before the display name was set; re-evaluate.
        setState({ status: 'unverified', user: cred.user })
      },
      async signInWithEmail(email, password) {
        await signInWithEmailAndPassword(auth, email, password)
      },
      async signInWithGoogle() {
        const provider = new GoogleAuthProvider()
        try {
          await signInWithPopup(auth, provider)
        } catch (e) {
          if ((e as { code?: string }).code === 'auth/popup-blocked') {
            await signInWithRedirect(auth, provider)
            return
          }
          throw e
        }
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(auth, email)
      },
      async resendVerification() {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser)
      },
      async refreshVerification() {
        const user = auth.currentUser
        if (!user) return
        await user.reload()
        if (isVerified(user)) {
          await user.getIdToken(true) // pick up email_verified for Firestore rules
          retry()
        }
      },
      async signOut() {
        await fbSignOut(auth)
      },
      retry,
      async saveProfile(body) {
        const updated = await api.updateProfile(body)
        setState((s) => (s.status === 'ready' ? { ...s, profile: updated } : s))
      },
      async deleteAccount(password) {
        const user = auth.currentUser
        if (!user) return
        // Re-authenticate first so a stale session can't leave us half-deleted (SPEC §7.4).
        if (isGoogle(user)) {
          await reauthenticateWithPopup(user, new GoogleAuthProvider())
        } else {
          if (!user.email || !password) throw new Error('Enter your password to confirm.')
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
        }
        await deleteAllUserData(user.uid)
        await deleteUser(user)
        setSession(null)
      },
    }),
    [state, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export type { Profile }
