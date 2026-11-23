// Mastery / frontier tier / suggested weights (local SPEC §3.6) and the
// incremental stats update applied when an exam completes.

import {
  ALL_SKILLS,
  DIFFICULTY_TIERS,
  MIN_TRUSTED_TIER_ATTEMPTS,
  TIER_SPLITS,
  WEIGHT_WINDOW_SIZE,
  type Difficulty,
} from './taxonomy'

export interface TierStat {
  attempts: number
  correct: number
  /** Most recent attempts, newest first (1 = correct, 0 = incorrect/skipped), capped. */
  recent: (0 | 1)[]
}

/** Keyed by `${skill}|${difficulty}`. */
export type TierStats = Record<string, TierStat>

export const tierKey = (skill: string, tier: string) => `${skill}|${tier}`

export function computeFrontierTier(
  stats: TierStats,
  skill: string,
  masteryThreshold: number,
): Difficulty {
  for (const tier of DIFFICULTY_TIERS) {
    const s = stats[tierKey(skill, tier)]
    const mastered =
      !!s && s.attempts >= MIN_TRUSTED_TIER_ATTEMPTS && s.correct / s.attempts >= masteryThreshold / 100
    if (!mastered) return tier
  }
  return DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1]
}

export function computeSuggestedWeights(
  stats: TierStats,
  masteryThreshold: number,
): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const skill of ALL_SKILLS) {
    const frontier = computeFrontierTier(stats, skill, masteryThreshold)
    const pooled: number[] = []
    for (const [tier, pct] of Object.entries(TIER_SPLITS[frontier])) {
      const cap = Math.round(WEIGHT_WINDOW_SIZE * (pct as number))
      if (cap <= 0) continue
      pooled.push(...(stats[tierKey(skill, tier)]?.recent ?? []).slice(0, cap))
    }
    if (pooled.length < WEIGHT_WINDOW_SIZE) {
      weights[skill] = 5
      continue
    }
    const accuracy = pooled.reduce<number>((s, c) => s + c, 0) / WEIGHT_WINDOW_SIZE
    weights[skill] = Math.min(10, Math.max(0, Math.floor((1 - accuracy) * 10)))
  }
  return weights
}

export interface Attempt {
  skill: string
  difficulty: string
  isCorrect: boolean
}

/** Folds a completed exam's attempts (in question order) into the tier stats. Pure. */
export function applyAttempts(stats: TierStats, attempts: Attempt[]): TierStats {
  const next: TierStats = {}
  for (const [k, v] of Object.entries(stats)) next[k] = { ...v, recent: [...v.recent] }
  for (const a of attempts) {
    const key = tierKey(a.skill, a.difficulty)
    const s = (next[key] ??= { attempts: 0, correct: 0, recent: [] })
    s.attempts += 1
    if (a.isCorrect) s.correct += 1
    s.recent.unshift(a.isCorrect ? 1 : 0) // later questions in the exam are newer
    s.recent.length = Math.min(s.recent.length, WEIGHT_WINDOW_SIZE)
  }
  return next
}
