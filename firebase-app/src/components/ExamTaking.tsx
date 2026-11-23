import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Exam } from '../lib/types'

interface Props {
  examId: string
  onComplete: (examId: string) => void
  onBack: () => void
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function ExamTaking({ examId, onComplete, onBack }: Props) {
  const [exam, setExam] = useState<Exam | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getExam(examId)
      .then((e) => (e.status === 'completed' ? onComplete(e.id) : setExam(e)))
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  if (loadError) {
    return (
      <div className="app-shell">
        <button onClick={onBack}>&larr; Back</button>
        <p className="error-text">{loadError}</p>
      </div>
    )
  }
  if (!exam) {
    return (
      <div className="app-shell">
        <p className="muted">Loading exam…</p>
      </div>
    )
  }
  return <ExamBody initialExam={exam} onComplete={onComplete} />
}

function ExamBody({
  initialExam,
  onComplete,
}: {
  initialExam: Exam
  onComplete: (examId: string) => void
}) {
  const [exam, setExam] = useState(initialExam)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialExam.questions.filter((q) => q.selected_choice).map((q) => [q.id, q.selected_choice!]),
    ),
  )
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialExam.questions.map((q) => [q.id, q.flagged])),
  )
  const [currentIndex, setCurrentIndex] = useState(() => {
    const firstUnanswered = initialExam.questions.findIndex((q) => !q.selected_choice)
    return initialExam.status === 'in_progress' && firstUnanswered > 0 ? firstUnanswered : 0
  })
  const [, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  const accumulated = useRef<Record<string, number>>(
    Object.fromEntries(initialExam.questions.map((q) => [q.id, q.time_spent_seconds])),
  )
  const visitStart = useRef<number>(Date.now())
  const autoSubmitted = useRef(false)

  const started = exam.status === 'in_progress' || exam.status === 'completed'
  const questions = exam.questions
  const current = questions[currentIndex]

  // Countdown tick.
  useEffect(() => {
    if (!started) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [started])

  // Derived from the saved server start time, corrected for client clock skew (SPEC §6.3).
  const remainingSeconds = (() => {
    if (exam.started_at_ms == null) return exam.time_limit_seconds
    const elapsed = (Date.now() + exam.clock_offset_ms - exam.started_at_ms) / 1000
    return exam.time_limit_seconds - elapsed
  })()

  function currentElapsedSeconds(qid: string): number {
    const acc = accumulated.current[qid] ?? 0
    if (current && current.id === qid) {
      return acc + Math.floor((Date.now() - visitStart.current) / 1000)
    }
    return acc
  }

  async function submitFor(qid: string, choice: string) {
    const timeSpent = currentElapsedSeconds(qid)
    try {
      await api.submitResponse(exam.id, {
        question_id: qid,
        selected_choice: choice,
        time_spent_seconds: timeSpent,
      })
      accumulated.current[qid] = timeSpent
      if (current && current.id === qid) visitStart.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function handleSelect(choice: string) {
    if (!current) return
    setAnswers((prev) => ({ ...prev, [current.id]: choice }))
    submitFor(current.id, choice)
  }

  async function handleToggleFlag() {
    if (!current) return
    const qid = current.id
    const next = !flags[qid]
    setFlags((prev) => ({ ...prev, [qid]: next }))
    try {
      await api.setFlag(exam.id, qid, next)
    } catch (e) {
      setFlags((prev) => ({ ...prev, [qid]: !next }))
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return
    if (current && answers[current.id]) {
      submitFor(current.id, answers[current.id])
    }
    setCurrentIndex(index)
    visitStart.current = Date.now()
  }

  async function finishExam() {
    if (finishing) return
    setFinishing(true)
    if (current && answers[current.id]) {
      await submitFor(current.id, answers[current.id])
    }
    try {
      await api.completeExam(exam.id)
      onComplete(exam.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFinishing(false)
    }
  }

  // Flush time spent on the current question when the tab is hidden/closed (SPEC §6.3).
  useEffect(() => {
    function flush() {
      if (document.visibilityState === 'hidden' && started && current && answers[current.id]) {
        submitFor(current.id, answers[current.id])
      }
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, currentIndex, answers])

  // Auto-submit when time runs out.
  useEffect(() => {
    if (started && remainingSeconds <= 0 && !autoSubmitted.current) {
      autoSubmitted.current = true
      finishExam()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, started])

  async function handleStart() {
    setError(null)
    try {
      const updated = await api.startExam(exam.id)
      setExam(updated)
      visitStart.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!started) {
    return (
      <div className="app-shell">
        <div className="card stack" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <h1 style={{ margin: 0 }}>
            {exam.type === 'baseline' ? 'Baseline Practice Exam' : 'Generated Practice Exam'}
          </h1>
          <p className="muted">
            {questions.length} questions &middot; {formatTime(exam.time_limit_seconds)}{' '}
            time limit
          </p>
          {error && <p className="error-text">{error}</p>}
          <div>
            <button className="primary" onClick={handleStart}>
              Start
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!current) return null

  const answeredCount = Object.keys(answers).length
  const isLowTime = remainingSeconds <= 60

  return (
    <div className="app-shell">
      <div className="exam-header">
        <div className="muted">
          Question {currentIndex + 1} of {questions.length} &middot; {answeredCount} answered
        </div>
        <div className={`timer${isLowTime ? ' low-time' : ''}`}>
          {formatTime(remainingSeconds)}
        </div>
      </div>

      <div className="question-nav">
        {questions.map((q, i) => (
          <button
            key={q.id}
            className={`question-dot${answers[q.id] ? ' answered' : ''}${
              flags[q.id] ? ' flagged' : ''
            }${i === currentIndex ? ' current' : ''}`}
            onClick={() => goTo(i)}
            title={flags[q.id] ? `Question ${i + 1} (flagged)` : `Question ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="row-between" style={{ marginBottom: '0.75rem' }}>
          <span className="muted">Question {currentIndex + 1}</span>
          <button
            className={`flag-toggle${flags[current.id] ? ' active' : ''}`}
            onClick={handleToggleFlag}
          >
            {flags[current.id] ? 'Flagged for review' : 'Flag for review'}
          </button>
        </div>
        {current.passage && <div className="passage">{current.passage}</div>}
        <div className="stem">{current.stem}</div>
        <div className="choice-list">
          {Object.entries(current.choices).map(([letter, text]) => (
            <button
              key={letter}
              className={`choice${answers[current.id] === letter ? ' selected' : ''}`}
              onClick={() => handleSelect(letter)}
            >
              <span className="letter">{letter}</span>
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="exam-nav-buttons">
        <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
          Previous
        </button>
        {currentIndex === questions.length - 1 ? (
          <button className="primary" onClick={finishExam} disabled={finishing}>
            {finishing ? 'Submitting…' : 'Submit Exam'}
          </button>
        ) : (
          <button onClick={() => goTo(currentIndex + 1)}>Next</button>
        )}
      </div>
    </div>
  )
}
