import { describe, expect, it } from 'vitest'
import bankJson from '../bank/question-bank.json'
import {
  buildBaselineAllocation,
  largestRemainderAllocation,
  redistributeShortfalls,
  sampleEasyOnlyExam,
  sampleGeneratedExam,
  sampleRandomExam,
  validateWeights,
  type Rng,
} from './sampling'
import { ALL_SKILLS, type Question } from './taxonomy'
import { applyAttempts, computeFrontierTier, computeSuggestedWeights, tierKey, type TierStats } from './weights'
import { computePerSkillStats, computeScore } from './scoring'

const bank = bankJson as Question[]

function seeded(seed: number): Rng {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

describe('question bank', () => {
  it('has 1000 valid questions across 11 skills', () => {
    expect(bank).toHaveLength(1000)
    expect(new Set(bank.map((q) => q.skill)).size).toBe(11)
  })
})

describe('allocation', () => {
  it('largest remainder sums to total', () => {
    const a = largestRemainderAllocation({ a: 1, b: 1, c: 1 }, 10)
    expect(Object.values(a).reduce((x, y) => x + y)).toBe(10)
  })
  it('redistributes shortfalls', () => {
    expect(redistributeShortfalls({ a: 5, b: 5 }, { a: 2, b: 20 })).toEqual({ a: 2, b: 8 })
  })
  it('baseline allocation sums to 27 with domain proportions', () => {
    const alloc = buildBaselineAllocation()
    expect(Object.values(alloc).reduce((x, y) => x + y)).toBe(27)
    expect(Object.keys(alloc)).toHaveLength(11)
  })
})

describe('first-exam modes', () => {
  it('random: 27 unique questions', () => {
    const qs = sampleRandomExam(bank, seeded(1))
    expect(qs).toHaveLength(27)
    expect(new Set(qs.map((q) => q.id)).size).toBe(27)
  })
  it('easy only: 27 unique Easy questions', () => {
    const qs = sampleEasyOnlyExam(bank, seeded(2))
    expect(qs).toHaveLength(27)
    expect(new Set(qs.map((q) => q.id)).size).toBe(27)
    expect(qs.every((q) => q.difficulty === 'Easy')).toBe(true)
  })
})

describe('frontier and mastery', () => {
  const k = (skill: string, tier: string) => tierKey(skill, tier)
  it('defaults to Easy with no history', () => {
    expect(computeFrontierTier({}, 'Transitions', 80)).toBe('Easy')
  })
  it('needs >= 3 attempts to master', () => {
    const stats: TierStats = { [k('Transitions', 'Easy')]: { attempts: 2, correct: 2, recent: [1, 1] } }
    expect(computeFrontierTier(stats, 'Transitions', 80)).toBe('Easy')
    stats[k('Transitions', 'Easy')] = { attempts: 3, correct: 3, recent: [1, 1, 1] }
    expect(computeFrontierTier(stats, 'Transitions', 80)).toBe('Medium')
  })
  it('stays at Hard when everything is mastered', () => {
    const stats: TierStats = {}
    for (const t of ['Easy', 'Medium', 'Hard']) stats[k('Transitions', t)] = { attempts: 5, correct: 5, recent: [] }
    expect(computeFrontierTier(stats, 'Transitions', 80)).toBe('Hard')
  })
  it('respects the mastery threshold', () => {
    const stats: TierStats = { [k('Transitions', 'Easy')]: { attempts: 10, correct: 7, recent: [] } }
    expect(computeFrontierTier(stats, 'Transitions', 70)).toBe('Medium')
    expect(computeFrontierTier(stats, 'Transitions', 80)).toBe('Easy')
  })
})

describe('suggested weights', () => {
  it('is neutral 5 with fewer than 20 pooled attempts', () => {
    const w = computeSuggestedWeights({}, 80)
    expect(ALL_SKILLS.every((s) => w[s] === 5)).toBe(true)
  })
  it('computes floor((1-accuracy)*10) over the pooled window', () => {
    // frontier Easy => cap 15 Easy + 5 Medium. 20 pooled, 15 correct => acc .75 => weight 2
    const stats: TierStats = {
      [tierKey('Transitions', 'Easy')]: { attempts: 15, correct: 10, recent: [...Array(10).fill(1), ...Array(5).fill(0)] },
      [tierKey('Transitions', 'Medium')]: { attempts: 5, correct: 5, recent: Array(5).fill(1) },
    }
    expect(computeSuggestedWeights(stats, 100).Transitions).toBe(2)
  })
})

describe('generated exams', () => {
  const weights = Object.fromEntries(ALL_SKILLS.map((s) => [s, 5]))
  it('rejects all-zero weights', () => {
    expect(validateWeights(Object.fromEntries(ALL_SKILLS.map((s) => [s, 0])))).toMatch(/At least one/)
    expect(validateWeights(weights)).toBeNull()
  })
  it('samples 27 unique questions and prefers unseen', () => {
    const seen = new Set(bank.slice(0, 400).map((q) => q.id))
    const qs = sampleGeneratedExam(bank, weights, {}, 80, seen, seeded(3))
    expect(qs).toHaveLength(27)
    expect(new Set(qs.map((q) => q.id)).size).toBe(27)
    expect(qs.every((q) => !seen.has(q.id))).toBe(true)
  })
  it('only samples non-zero-weight skills', () => {
    const only = Object.fromEntries(ALL_SKILLS.map((s) => [s, s === 'Transitions' ? 4 : 0]))
    const qs = sampleGeneratedExam(bank, only, {}, 80, new Set(), seeded(4))
    expect(qs.every((q) => q.skill === 'Transitions')).toBe(true)
    expect(qs).toHaveLength(27)
  })
  it('skews toward Easy/Medium for a new frontier-Easy skill', () => {
    const only = Object.fromEntries(ALL_SKILLS.map((s) => [s, s === 'Boundaries' ? 4 : 0]))
    const qs = sampleGeneratedExam(bank, only, {}, 80, new Set(), seeded(5))
    expect(qs.filter((q) => q.difficulty === 'Hard')).toHaveLength(0)
  })
})

describe('stats update and scoring', () => {
  it('applyAttempts increments and caps recent at 20', () => {
    const attempts = Array.from({ length: 25 }, () => ({ skill: 'Transitions', difficulty: 'Easy', isCorrect: true }))
    const next = applyAttempts({}, attempts)
    const s = next[tierKey('Transitions', 'Easy')]
    expect(s.attempts).toBe(25)
    expect(s.correct).toBe(25)
    expect(s.recent).toHaveLength(20)
  })
  it('skipped counts as attempted and incorrect', () => {
    const rs = [
      { skill: 'Transitions', isCorrect: true, timeSpentSeconds: 10 },
      { skill: 'Transitions', isCorrect: false, timeSpentSeconds: null },
    ]
    expect(computeScore(rs)).toEqual({ correct: 1, total: 2, percentage: 50 })
    expect(computePerSkillStats(rs)[0]).toMatchObject({ attempted: 2, correct: 1, accuracy: 50, avg_time_spent_seconds: 10 })
  })
})
