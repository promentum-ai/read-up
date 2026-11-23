// Port of full-stack/backend/app/taxonomy.py (local SPEC §3.2, §3.6).

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type Choice = 'A' | 'B' | 'C' | 'D'

export const CHOICES: Choice[] = ['A', 'B', 'C', 'D']

export const DOMAINS: Record<string, string[]> = {
  'Information and Ideas': [
    'Central Ideas and Details',
    'Command of Evidence (Textual)',
    'Command of Evidence (Quantitative)',
    'Inferences',
  ],
  'Craft and Structure': [
    'Words in Context',
    'Text Structure and Purpose',
    'Cross-Text Connections',
  ],
  'Expression of Ideas': ['Rhetorical Synthesis', 'Transitions'],
  'Standard English Conventions': ['Boundaries', 'Form, Structure, and Sense'],
}

export const DOMAIN_DISTRIBUTION: Record<string, number> = {
  'Information and Ideas': 0.26,
  'Craft and Structure': 0.28,
  'Expression of Ideas': 0.2,
  'Standard English Conventions': 0.26,
}

export const ALL_SKILLS: string[] = Object.values(DOMAINS).flat()

export const SKILL_TO_DOMAIN: Record<string, string> = Object.fromEntries(
  Object.entries(DOMAINS).flatMap(([domain, skills]) => skills.map((s) => [s, domain])),
)

export const QUESTIONS_PER_MODULE = 27
export const MODULE_TIME_LIMIT_SECONDS = 32 * 60

export const DIFFICULTY_TIERS: Difficulty[] = ['Easy', 'Medium', 'Hard']

export const MASTERY_THRESHOLD_DEFAULT = 80
export const MASTERY_THRESHOLD_MIN = 50
export const MASTERY_THRESHOLD_MAX = 100

export const MIN_TRUSTED_TIER_ATTEMPTS = 3
export const WEIGHT_WINDOW_SIZE = 20

export const TIER_SPLITS: Record<Difficulty, Partial<Record<Difficulty, number>>> = {
  Easy: { Easy: 0.75, Medium: 0.25 },
  Medium: { Easy: 0.15, Medium: 0.6, Hard: 0.25 },
  Hard: { Medium: 0.15, Hard: 0.85 },
}

export interface Question {
  id: string
  domain: string
  skill: string
  difficulty: Difficulty
  passage: string | null
  stem: string
  choices: Record<Choice, string>
  correctChoice: Choice
  explanations: Record<Choice, string>
}
