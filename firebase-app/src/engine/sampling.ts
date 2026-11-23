// Pure port of full-stack/backend/app/sampling.py. No Firebase imports; the
// RNG is injectable so tests are deterministic.

import {
  DIFFICULTY_TIERS,
  DOMAINS,
  DOMAIN_DISTRIBUTION,
  QUESTIONS_PER_MODULE,
  TIER_SPLITS,
  type Difficulty,
  type Question,
} from './taxonomy'
import { computeFrontierTier, type TierStats } from './weights'

export type Rng = () => number

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function largestRemainderAllocation(
  weights: Record<string, number>,
  total: number,
): Record<string, number> {
  const keys = Object.keys(weights)
  const sum = keys.reduce((s, k) => s + weights[k], 0)
  if (sum <= 0 || total <= 0) return Object.fromEntries(keys.map((k) => [k, 0]))

  const raw = Object.fromEntries(keys.map((k) => [k, (total * weights[k]) / sum]))
  const floors = Object.fromEntries(keys.map((k) => [k, Math.floor(raw[k])]))
  const remainder = total - keys.reduce((s, k) => s + floors[k], 0)
  const ordered = [...keys].sort((a, b) => raw[b] - floors[b] - (raw[a] - floors[a]))
  for (const k of ordered.slice(0, remainder)) floors[k] += 1
  return floors
}

export function redistributeShortfalls(
  allocation: Record<string, number>,
  available: Record<string, number>,
): Record<string, number> {
  const alloc = { ...allocation }
  const avail = (k: string) => available[k] ?? 0
  for (let pass = 0; pass <= Object.keys(alloc).length; pass++) {
    const shortKeys = Object.keys(alloc).filter((k) => alloc[k] > avail(k))
    if (shortKeys.length === 0) break
    const totalShortfall = shortKeys.reduce((s, k) => s + alloc[k] - avail(k), 0)
    for (const k of shortKeys) alloc[k] = avail(k)

    const receivers = Object.keys(alloc).filter((k) => !shortKeys.includes(k) && alloc[k] < avail(k))
    if (receivers.length === 0) break
    const extra = largestRemainderAllocation(
      Object.fromEntries(receivers.map((k) => [k, Math.max(alloc[k], 1)])),
      totalShortfall,
    )
    for (const k of receivers) {
      const headroom = avail(k) - alloc[k]
      alloc[k] += Math.max(Math.min(extra[k], headroom), 0)
    }
  }
  return alloc
}

function samplePool(pool: Question[], count: number, seen: Set<string>, rng: Rng): Question[] {
  if (count <= 0) return []
  const unseen = shuffle(pool.filter((q) => !seen.has(q.id)), rng)
  const repeats = shuffle(pool.filter((q) => seen.has(q.id)), rng)
  return [...unseen, ...repeats].slice(0, count)
}

// --- first-exam modes -------------------------------------------------------

export function buildBaselineAllocation(): Record<string, number> {
  const domainCounts = largestRemainderAllocation(DOMAIN_DISTRIBUTION, QUESTIONS_PER_MODULE)
  const allocation: Record<string, number> = {}
  for (const [domain, skills] of Object.entries(DOMAINS)) {
    const equal = Object.fromEntries(skills.map((s) => [s, 1]))
    Object.assign(allocation, largestRemainderAllocation(equal, domainCounts[domain]))
  }
  return allocation
}

export function sampleRandomExam(bank: Question[], rng: Rng = Math.random): Question[] {
  return shuffle(bank, rng).slice(0, QUESTIONS_PER_MODULE)
}

export function sampleEasyOnlyExam(bank: Question[], rng: Rng = Math.random): Question[] {
  const easy = bank.filter((q) => q.difficulty === 'Easy')
  const chosen: Question[] = []
  for (const [skill, count] of Object.entries(buildBaselineAllocation())) {
    if (count <= 0) continue
    chosen.push(...shuffle(easy.filter((q) => q.skill === skill), rng).slice(0, count))
  }
  if (chosen.length < QUESTIONS_PER_MODULE) {
    const already = new Set(chosen.map((q) => q.id))
    const backfill = shuffle(easy.filter((q) => !already.has(q.id)), rng)
    chosen.push(...backfill.slice(0, QUESTIONS_PER_MODULE - chosen.length))
  }
  return shuffle(chosen, rng).slice(0, QUESTIONS_PER_MODULE)
}

// --- generated exams --------------------------------------------------------

export function buildWeightedAllocation(weights: Record<string, number>): Record<string, number> {
  const nonZero = Object.fromEntries(Object.entries(weights).filter(([, w]) => w > 0))
  return largestRemainderAllocation(nonZero, QUESTIONS_PER_MODULE)
}

export function validateWeights(weights: Record<string, number>): string | null {
  const values = Object.values(weights)
  if (!values.every((w) => Number.isInteger(w) && w >= 0 && w <= 10)) {
    return 'Each weight must be an integer from 0 to 10.'
  }
  if (!values.some((w) => w > 0)) return 'At least one category must have a weight greater than 0.'
  return null
}

function sampleSkillWithTierSplit(
  bank: Question[],
  skill: string,
  count: number,
  split: Partial<Record<Difficulty, number>>,
  seen: Set<string>,
  rng: Rng,
): Question[] {
  const inSkill = bank.filter((q) => q.skill === skill)
  let tierAlloc = largestRemainderAllocation(split as Record<string, number>, count)
  const unseenByTier = Object.fromEntries(
    Object.keys(tierAlloc).map((t) => [
      t,
      inSkill.filter((q) => q.difficulty === t && !seen.has(q.id)).length,
    ]),
  )
  tierAlloc = redistributeShortfalls(tierAlloc, unseenByTier)

  const chosen: Question[] = []
  for (const [tier, n] of Object.entries(tierAlloc)) {
    chosen.push(...samplePool(inSkill.filter((q) => q.difficulty === tier), n, seen, rng))
  }
  if (chosen.length < count) {
    const already = new Set(chosen.map((q) => q.id))
    const backfill = shuffle(inSkill.filter((q) => !already.has(q.id)), rng)
    chosen.push(...backfill.slice(0, count - chosen.length))
  }
  return chosen
}

export function sampleGeneratedExam(
  bank: Question[],
  weights: Record<string, number>,
  tierStats: TierStats,
  masteryThreshold: number,
  seen: Set<string>,
  rng: Rng = Math.random,
): Question[] {
  let skillAlloc = buildWeightedAllocation(weights)
  const unseenBySkill = Object.fromEntries(
    Object.keys(skillAlloc).map((s) => [
      s,
      bank.filter((q) => q.skill === s && !seen.has(q.id)).length,
    ]),
  )
  skillAlloc = redistributeShortfalls(skillAlloc, unseenBySkill)

  const chosen: Question[] = []
  for (const [skill, count] of Object.entries(skillAlloc)) {
    if (count <= 0) continue
    const frontier = computeFrontierTier(tierStats, skill, masteryThreshold)
    chosen.push(
      ...sampleSkillWithTierSplit(bank, skill, count, TIER_SPLITS[frontier], seen, rng),
    )
  }
  if (chosen.length < QUESTIONS_PER_MODULE) {
    const already = new Set(chosen.map((q) => q.id))
    const skills = new Set(Object.keys(skillAlloc))
    const backfill = shuffle(
      bank.filter((q) => skills.has(q.skill) && !already.has(q.id)),
      rng,
    )
    chosen.push(...backfill.slice(0, QUESTIONS_PER_MODULE - chosen.length))
  }
  return shuffle(chosen, rng).slice(0, QUESTIONS_PER_MODULE)
}

export { DIFFICULTY_TIERS }
