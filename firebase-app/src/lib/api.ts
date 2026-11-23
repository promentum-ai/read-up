// Same call surface as the local app's HTTP client (full-stack/frontend/src/lib/api.ts),
// now implemented with the local engine + Firestore. The signed-in user is the
// profile, so profileId parameters are gone and IDs are strings (SPEC §2).

import type { QuestionBank } from '../bank'
import * as fs from '../data/firestore'
import type { BaselineMode, Profile, ProfileUpdate } from './types'

interface Session {
  uid: string
  email: string | null
  bank: QuestionBank
  profile: Profile
}

let session: Session | null = null

export function setSession(s: Session | null) {
  session = s
}

function need(): Session {
  if (!session) throw new fs.AppError('You are signed out. Please sign in again.')
  return session
}

export const ApiError = fs.AppError

export const api = {
  updateProfile: async (body: ProfileUpdate) => {
    const s = need()
    const updated = await fs.updateProfile(s.uid, s.email, body)
    s.profile = updated
    return updated
  },

  getExams: () => fs.listExams(need().uid),
  getSuggestedWeights: () => {
    const s = need()
    return fs.getSuggestedWeights(s.uid, s.profile.mastery_threshold)
  },
  hasCompletedExam: async () => (await fs.getStats(need().uid)).completedExamCount > 0,

  createBaselineExam: (mode: BaselineMode) => {
    const s = need()
    return fs.createBaselineExam(s.uid, s.bank, mode)
  },
  createGeneratedExam: (weights: Record<string, number>) => {
    const s = need()
    return fs.createGeneratedExam(s.uid, s.bank, s.profile.mastery_threshold, weights)
  },

  getExam: (examId: string) => {
    const s = need()
    return fs.getExam(s.uid, s.bank, examId)
  },
  startExam: (examId: string) => {
    const s = need()
    return fs.startExam(s.uid, s.bank, examId)
  },
  submitResponse: (
    examId: string,
    body: { question_id: string; selected_choice: string; time_spent_seconds: number },
  ) => {
    const s = need()
    return fs.submitResponse(s.uid, s.bank, examId, body)
  },
  setFlag: (examId: string, questionId: string, flagged: boolean) => {
    const s = need()
    return fs.setFlag(s.uid, s.bank, examId, questionId, flagged)
  },
  completeExam: (examId: string) => {
    const s = need()
    return fs.completeExam(s.uid, s.bank, examId)
  },
  getResults: (examId: string) => {
    const s = need()
    return fs.getResults(s.uid, s.bank, examId)
  },
}
