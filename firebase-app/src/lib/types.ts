// UI-facing shapes. Field names stay snake_case (as in the local app) so the
// components barely change; src/lib/api.ts maps Firestore documents to these.

export type { Score, SkillStat } from '../engine/scoring'
import type { Score, SkillStat } from '../engine/scoring'

export interface Profile {
  id: string // Firebase uid
  name: string
  email: string | null
  mastery_threshold: number
}

export interface ProfileUpdate {
  name?: string
  mastery_threshold?: number
}

export type BaselineMode = 'random' | 'easy_only'
export type ExamStatus = 'created' | 'in_progress' | 'completed'
export type ExamType = 'baseline' | 'generated'

export interface ExamHistoryEntry {
  id: string
  type: ExamType
  status: ExamStatus
  created_at: number // epoch ms
  completed_at: number | null
  score: Score | null
  per_skill: SkillStat[]
}

export interface QuestionInProgress {
  position: number
  id: string
  domain: string
  skill: string
  passage: string | null
  stem: string
  choices: Record<string, string>
  flagged: boolean
  selected_choice: string | null
  time_spent_seconds: number
}

export interface Exam {
  id: string
  type: ExamType
  status: ExamStatus
  created_at: number
  started_at_ms: number | null // server time of start
  clock_offset_ms: number // serverNow - clientNow, measured at load
  time_limit_seconds: number
  questions: QuestionInProgress[]
}

export interface QuestionReview {
  position: number
  id: string
  domain: string
  skill: string
  difficulty: string
  passage: string | null
  stem: string
  choices: Record<string, string>
  correct_choice: string
  explanations: Record<string, string>
  selected_choice: string | null
  is_correct: boolean | null
  skipped: boolean
  time_spent_seconds: number | null
}

export interface Results {
  exam_id: string
  score: Score
  per_skill: SkillStat[]
  review: QuestionReview[]
}

export interface SuggestedWeights {
  weights: Record<string, number>
}
