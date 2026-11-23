// Firestore access (SPEC §5, §6). All exam logic is delegated to ../engine.

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { QuestionBank } from '../bank'
import {
  sampleEasyOnlyExam,
  sampleGeneratedExam,
  sampleRandomExam,
  validateWeights,
} from '../engine/sampling'
import { computePerSkillStats, computeScore, type Score, type SkillStat } from '../engine/scoring'
import {
  MASTERY_THRESHOLD_DEFAULT,
  MASTERY_THRESHOLD_MAX,
  MASTERY_THRESHOLD_MIN,
  MODULE_TIME_LIMIT_SECONDS,
  type Choice,
} from '../engine/taxonomy'
import { applyAttempts, computeSuggestedWeights, type TierStats } from '../engine/weights'
import type {
  BaselineMode,
  Exam,
  ExamHistoryEntry,
  ExamStatus,
  ExamType,
  Profile,
  ProfileUpdate,
  QuestionInProgress,
  QuestionReview,
  Results,
} from '../lib/types'

export class AppError extends Error {}

const userRef = (uid: string) => doc(db, 'users', uid)
const statsRef = (uid: string) => doc(db, 'users', uid, 'stats', 'summary')
const examsCol = (uid: string) => collection(db, 'users', uid, 'exams')
const examRef = (uid: string, examId: string) => doc(db, 'users', uid, 'exams', examId)
const responsesCol = (uid: string, examId: string) =>
  collection(db, 'users', uid, 'exams', examId, 'responses')
const responseRef = (uid: string, examId: string, qid: string) =>
  doc(db, 'users', uid, 'exams', examId, 'responses', qid)

const ms = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null)

// --- profile ----------------------------------------------------------------

function toProfile(uid: string, email: string | null, d: DocumentData): Profile {
  return { id: uid, email, name: d.displayName, mastery_threshold: d.masteryThreshold }
}

/** Loads the profile, creating it on first sign-in (SPEC §3.3). */
export async function ensureProfile(
  uid: string,
  email: string | null,
  displayName: string | null,
): Promise<Profile> {
  const snap = await getDoc(userRef(uid))
  if (snap.exists()) return toProfile(uid, email, snap.data())
  const name = (displayName || email?.split('@')[0] || 'Student').trim().slice(0, 60) || 'Student'
  await setDoc(userRef(uid), {
    displayName: name,
    masteryThreshold: MASTERY_THRESHOLD_DEFAULT,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { id: uid, email, name, mastery_threshold: MASTERY_THRESHOLD_DEFAULT }
}

export async function updateProfile(
  uid: string,
  email: string | null,
  body: ProfileUpdate,
): Promise<Profile> {
  const patch: DocumentData = { updatedAt: serverTimestamp() }
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (name.length < 1 || name.length > 60) throw new AppError('Name must be 1–60 characters.')
    patch.displayName = name
  }
  if (body.mastery_threshold !== undefined) {
    const t = body.mastery_threshold
    if (!Number.isInteger(t) || t < MASTERY_THRESHOLD_MIN || t > MASTERY_THRESHOLD_MAX) {
      throw new AppError(`Mastery threshold must be an integer from ${MASTERY_THRESHOLD_MIN} to ${MASTERY_THRESHOLD_MAX}.`)
    }
    patch.masteryThreshold = t
  }
  await updateDoc(userRef(uid), patch)
  return toProfile(uid, email, (await getDocFromServer(userRef(uid))).data()!)
}

/** Server time minus client time, measured with a write+read round trip (SPEC §6.3). */
export async function measureClockOffset(uid: string): Promise<number> {
  const before = Date.now()
  await updateDoc(userRef(uid), { lastSeenAt: serverTimestamp() })
  const snap = await getDocFromServer(userRef(uid))
  const after = Date.now()
  const server = (snap.data()!.lastSeenAt as Timestamp).toMillis()
  return server - (before + after) / 2
}

// --- stats ------------------------------------------------------------------

export interface StatsSummary {
  completedExamCount: number
  tiers: TierStats
  seenQuestionIds: string[]
}

const emptyStats = (): StatsSummary => ({ completedExamCount: 0, tiers: {}, seenQuestionIds: [] })

function parseStats(d: DocumentData | undefined): StatsSummary {
  if (!d) return emptyStats()
  return {
    completedExamCount: d.completedExamCount ?? 0,
    // tiers are stored as JSON so keys containing '.', '(' etc. are safe field values.
    tiers: d.tiersJson ? JSON.parse(d.tiersJson) : {},
    seenQuestionIds: d.seenQuestionIds ?? [],
  }
}

export async function getStats(uid: string): Promise<StatsSummary> {
  return parseStats((await getDoc(statsRef(uid))).data())
}

export async function getSuggestedWeights(uid: string, threshold: number) {
  const stats = await getStats(uid)
  return { weights: computeSuggestedWeights(stats.tiers, threshold) }
}

// --- exams ------------------------------------------------------------------

async function createExamDoc(
  uid: string,
  bank: QuestionBank,
  mode: string,
  questionIds: string[],
  weights: Record<string, number> | null,
): Promise<Exam> {
  const ref = doc(examsCol(uid))
  const batch = writeBatch(db)
  batch.set(ref, {
    mode,
    status: 'created',
    questionIds,
    weights,
    durationSeconds: MODULE_TIME_LIMIT_SECONDS,
    createdAt: serverTimestamp(),
    startedAt: null,
    completedAt: null,
    result: null,
  })
  // "Seen" = placed on an exam, matching the local edition's behavior.
  batch.set(statsRef(uid), { seenQuestionIds: arrayUnion(...questionIds) }, { merge: true })
  await batch.commit()
  return getExam(uid, bank, ref.id)
}

async function assertNoActiveExam(uid: string) {
  const snap = await getDocs(examsCol(uid))
  if (snap.docs.some((d) => d.data().status !== 'completed')) {
    throw new AppError('Finish or resume your current exam before starting a new one.')
  }
}

export async function createBaselineExam(uid: string, bank: QuestionBank, mode: BaselineMode) {
  const stats = await getStats(uid)
  if (stats.completedExamCount > 0) {
    throw new AppError('The first-exam modes are only available before your first completed exam.')
  }
  await assertNoActiveExam(uid)
  const qs = mode === 'random' ? sampleRandomExam(bank.all()) : sampleEasyOnlyExam(bank.all())
  return createExamDoc(uid, bank, mode, qs.map((q) => q.id), null)
}

export async function createGeneratedExam(
  uid: string,
  bank: QuestionBank,
  threshold: number,
  weights: Record<string, number>,
) {
  const err = validateWeights(weights)
  if (err) throw new AppError(err)
  await assertNoActiveExam(uid)
  const stats = await getStats(uid)
  const qs = sampleGeneratedExam(
    bank.all(),
    weights,
    stats.tiers,
    threshold,
    new Set(stats.seenQuestionIds),
  )
  return createExamDoc(uid, bank, 'generated', qs.map((q) => q.id), weights)
}

const typeOf = (mode: string): ExamType => (mode === 'generated' ? 'generated' : 'baseline')

export async function getExam(uid: string, bank: QuestionBank, examId: string): Promise<Exam> {
  const [examSnap, respSnap] = await Promise.all([
    getDoc(examRef(uid, examId)),
    getDocs(responsesCol(uid, examId)),
  ])
  if (!examSnap.exists()) throw new AppError('Exam not found.')
  const d = examSnap.data({ serverTimestamps: 'estimate' })
  const responses = new Map(respSnap.docs.map((r) => [r.id, r.data()]))
  const questions: QuestionInProgress[] = (d.questionIds as string[]).map((id, position) => {
    const q = bank.byId(id)!
    const r = responses.get(id)
    return {
      position,
      id,
      domain: q.domain,
      skill: q.skill,
      passage: q.passage,
      stem: q.stem,
      choices: q.choices,
      flagged: r?.flagged ?? false,
      selected_choice: r?.selectedChoice ?? null,
      time_spent_seconds: r?.timeSpentSeconds ?? 0,
    }
  })
  return {
    id: examId,
    type: typeOf(d.mode),
    status: d.status as ExamStatus,
    created_at: ms(d.createdAt) ?? Date.now(),
    started_at_ms: ms(d.startedAt),
    clock_offset_ms: await measureClockOffset(uid),
    time_limit_seconds: d.durationSeconds,
    questions,
  }
}

export async function startExam(uid: string, bank: QuestionBank, examId: string): Promise<Exam> {
  const snap = await getDoc(examRef(uid, examId))
  if (!snap.exists()) throw new AppError('Exam not found.')
  if (snap.data().status === 'created') {
    await updateDoc(examRef(uid, examId), { status: 'in_progress', startedAt: serverTimestamp() })
  }
  return getExam(uid, bank, examId)
}

export async function submitResponse(
  uid: string,
  bank: QuestionBank,
  examId: string,
  body: { question_id: string; selected_choice: string; time_spent_seconds: number },
) {
  const q = bank.byId(body.question_id)
  if (!q) throw new AppError('Unknown question.')
  const isCorrect = q.correctChoice === body.selected_choice
  await setDoc(
    responseRef(uid, examId, q.id),
    {
      selectedChoice: body.selected_choice as Choice,
      isCorrect,
      skipped: false,
      timeSpentSeconds: Math.max(0, Math.round(body.time_spent_seconds)),
      skill: q.skill,
      difficulty: q.difficulty,
      answeredAt: serverTimestamp(),
    },
    { merge: true },
  )
  return {
    question_id: q.id,
    selected_choice: body.selected_choice,
    is_correct: isCorrect,
    time_spent_seconds: body.time_spent_seconds,
  }
}

export async function setFlag(
  uid: string,
  bank: QuestionBank,
  examId: string,
  questionId: string,
  flagged: boolean,
) {
  const q = bank.byId(questionId)
  if (!q) throw new AppError('Unknown question.')
  await setDoc(
    responseRef(uid, examId, questionId),
    { flagged, skill: q.skill, difficulty: q.difficulty },
    { merge: true },
  )
  return { question_id: questionId, flagged }
}

/** Idempotent transaction (SPEC §6.3): backfills skipped, scores, updates stats. */
export async function completeExam(uid: string, bank: QuestionBank, examId: string) {
  await runTransaction(db, async (tx) => {
    const examSnap = await tx.get(examRef(uid, examId))
    if (!examSnap.exists()) throw new AppError('Exam not found.')
    const exam = examSnap.data()
    if (exam.status === 'completed') return

    const questionIds = exam.questionIds as string[]
    const [statsSnap, ...respSnaps] = await Promise.all([
      tx.get(statsRef(uid)),
      ...questionIds.map((id) => tx.get(responseRef(uid, examId, id))),
    ])

    const scored = questionIds.map((id, i) => {
      const q = bank.byId(id)!
      const r = respSnaps[i].data()
      const answered = !!r?.selectedChoice
      return {
        id,
        skill: q.skill,
        difficulty: q.difficulty,
        answered,
        isCorrect: answered && r!.isCorrect === true,
        timeSpentSeconds: (r?.timeSpentSeconds as number | undefined) ?? null,
      }
    })

    const result = {
      ...computeScore(scored),
      perSkill: computePerSkillStats(scored),
    }
    const stats = parseStats(statsSnap.data())
    const tiers = applyAttempts(stats.tiers, scored)

    for (const s of scored) {
      if (!s.answered) {
        tx.set(
          responseRef(uid, examId, s.id),
          {
            selectedChoice: null,
            isCorrect: false,
            skipped: true,
            skill: s.skill,
            difficulty: s.difficulty,
            timeSpentSeconds: s.timeSpentSeconds ?? 0,
          },
          { merge: true },
        )
      }
    }
    tx.update(examRef(uid, examId), {
      status: 'completed',
      completedAt: serverTimestamp(),
      result,
    })
    tx.set(
      statsRef(uid),
      {
        completedExamCount: stats.completedExamCount + 1,
        tiersJson: JSON.stringify(tiers),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

export async function listExams(uid: string): Promise<ExamHistoryEntry[]> {
  const snap = await getDocs(query(examsCol(uid), orderBy('createdAt', 'desc')))
  return snap.docs.map((s) => {
    const d = s.data({ serverTimestamps: 'estimate' })
    const result = d.result as (Score & { perSkill: SkillStat[] }) | null
    return {
      id: s.id,
      type: typeOf(d.mode),
      status: d.status as ExamStatus,
      created_at: ms(d.createdAt) ?? Date.now(),
      completed_at: ms(d.completedAt),
      score: result ? { correct: result.correct, total: result.total, percentage: result.percentage } : null,
      per_skill: result?.perSkill ?? [],
    }
  })
}

export async function getResults(uid: string, bank: QuestionBank, examId: string): Promise<Results> {
  const [examSnap, respSnap] = await Promise.all([
    getDoc(examRef(uid, examId)),
    getDocs(responsesCol(uid, examId)),
  ])
  if (!examSnap.exists()) throw new AppError('Exam not found.')
  const exam = examSnap.data()
  if (exam.status !== 'completed' || !exam.result) throw new AppError('Exam is not completed yet.')
  const responses = new Map(respSnap.docs.map((r) => [r.id, r.data()]))
  const review: QuestionReview[] = (exam.questionIds as string[]).map((id, position) => {
    const q = bank.byId(id)!
    const r = responses.get(id)
    return {
      position,
      id,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      passage: q.passage,
      stem: q.stem,
      choices: q.choices,
      correct_choice: q.correctChoice,
      explanations: q.explanations,
      selected_choice: r?.selectedChoice ?? null,
      is_correct: r?.isCorrect ?? false,
      skipped: r?.skipped ?? !r?.selectedChoice,
      time_spent_seconds: r?.timeSpentSeconds ?? null,
    }
  })
  const { perSkill, ...score } = exam.result
  return { exam_id: examId, score, per_skill: perSkill, review }
}

// --- account deletion (SPEC §7.4): data only; the Auth user is deleted by the caller ---

export async function deleteAllUserData(uid: string) {
  const exams = await getDocs(examsCol(uid))
  for (const e of exams.docs) {
    const resp = await getDocs(responsesCol(uid, e.id))
    await Promise.all(resp.docs.map((r) => deleteDoc(r.ref)))
    await deleteDoc(e.ref)
  }
  await deleteDoc(statsRef(uid))
  await deleteDoc(userRef(uid))
}
