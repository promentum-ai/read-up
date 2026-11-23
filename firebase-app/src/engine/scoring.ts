import { SKILL_TO_DOMAIN } from './taxonomy'

export interface ScoredResponse {
  skill: string
  isCorrect: boolean
  timeSpentSeconds: number | null
}

export interface SkillStat {
  skill: string
  domain: string
  attempted: number
  correct: number
  accuracy: number
  avg_time_spent_seconds: number | null
}

export interface Score {
  correct: number
  total: number
  percentage: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function computeScore(responses: ScoredResponse[]): Score {
  const total = responses.length
  const correct = responses.filter((r) => r.isCorrect).length
  return { correct, total, percentage: total ? round1((correct / total) * 100) : 0 }
}

/** Skipped questions are responses with isCorrect=false, so they count as attempted. */
export function computePerSkillStats(responses: ScoredResponse[]): SkillStat[] {
  const bySkill = new Map<string, ScoredResponse[]>()
  for (const r of responses) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r])
  const stats: SkillStat[] = []
  for (const [skill, rs] of bySkill) {
    const correct = rs.filter((r) => r.isCorrect).length
    const times = rs.map((r) => r.timeSpentSeconds).filter((t): t is number => t != null)
    stats.push({
      skill,
      domain: SKILL_TO_DOMAIN[skill],
      attempted: rs.length,
      correct,
      accuracy: round1((correct / rs.length) * 100),
      avg_time_spent_seconds: times.length ? round1(times.reduce((a, b) => a + b, 0) / times.length) : null,
    })
  }
  return stats.sort((a, b) => a.domain.localeCompare(b.domain) || a.skill.localeCompare(b.skill))
}
