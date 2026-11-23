// Question bank behind an interface so Phase 3 can swap the static file for
// Functions/Firestore without touching the engine (SPEC §2, §4).

import bankUrl from './question-bank.json?url'
import type { Question } from '../engine/taxonomy'

export interface QuestionBank {
  all(): Question[]
  byId(id: string): Question | undefined
}

class StaticBank implements QuestionBank {
  private questions: Question[]
  private index: Map<string, Question>
  constructor(questions: Question[]) {
    this.questions = questions
    this.index = new Map(questions.map((q) => [q.id, q]))
  }
  all() {
    return this.questions
  }
  byId(id: string) {
    return this.index.get(id)
  }
}

let loading: Promise<QuestionBank> | null = null

/** Fetches the hashed, immutably-cached bank once per session (after sign-in). */
export function loadQuestionBank(): Promise<QuestionBank> {
  loading ??= fetch(bankUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the question bank (${res.status}).`)
      return res.json() as Promise<Question[]>
    })
    .then((qs) => new StaticBank(qs))
    .catch((e) => {
      loading = null // allow retry
      throw e
    })
  return loading
}
