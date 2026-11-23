import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ErrorScreen, LoadingScreen, SignInScreen, VerifyEmailScreen } from './auth/AuthScreens'
import { Dashboard } from './components/Dashboard'
import { ExamTaking } from './components/ExamTaking'
import { ResultsView } from './components/ResultsView'

function ExamRoute() {
  const { examId } = useParams()
  const navigate = useNavigate()
  return (
    <ExamTaking
      key={examId}
      examId={examId!}
      onComplete={(id) => navigate(`/results/${id}`, { replace: true })}
      onBack={() => navigate('/')}
    />
  )
}

function ResultsRoute() {
  const { examId } = useParams()
  const navigate = useNavigate()
  return <ResultsView key={examId} examId={examId!} onBack={() => navigate('/')} />
}

function Gate() {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return <LoadingScreen />
    case 'signedOut':
      return <SignInScreen />
    case 'unverified':
      return <VerifyEmailScreen />
    case 'loadingData':
      return <LoadingScreen text="Loading your data and question bank…" />
    case 'error':
      return <ErrorScreen message={state.message} />
    case 'ready':
      return (
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/exam/:examId" element={<ExamRoute />} />
          <Route path="/results/:examId" element={<ResultsRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
