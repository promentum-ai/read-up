#!/usr/bin/env node
// CSV -> validated JSON question bank (firebase-public SPEC §4.4).
//   node scripts/build-question-bank.mjs [csvPath] [--ndjson]
// Writes src/bank/question-bank.json (imported by the app via Vite's ?url).
// With --ndjson also writes question-bank.ndjson (one doc per line, id = SATRW-####)
// for a future Firestore `question-bank` collection import (Phase 3).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const ndjson = args.includes('--ndjson')
const csvPath = resolve(
  args.find((a) => !a.startsWith('--')) ??
    resolve(here, '../../full-stack/SAT_Reading_Writing_Question_Bank_1000.csv'),
)

const DOMAINS = {
  'Information and Ideas': ['Central Ideas and Details', 'Command of Evidence (Textual)', 'Command of Evidence (Quantitative)', 'Inferences'],
  'Craft and Structure': ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'],
  'Expression of Ideas': ['Rhetorical Synthesis', 'Transitions'],
  'Standard English Conventions': ['Boundaries', 'Form, Structure, and Sense'],
}
const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const LETTERS = ['A', 'B', 'C', 'D']

function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '')
const [header, ...rows] = parseCsv(text)
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
const errors = []
const questions = rows.map((r, n) => {
  const get = (k) => (r[idx[k]] ?? '').trim()
  const q = {
    id: get('QuestionID'),
    domain: get('Domain'),
    skill: get('Skill'),
    difficulty: get('Difficulty'),
    passage: get('Passage') || null,
    stem: get('Question'),
    choices: Object.fromEntries(LETTERS.map((l) => [l, get(`Choice${l}`)])),
    correctChoice: get('CorrectAnswer'),
    explanations: Object.fromEntries(LETTERS.map((l) => [l, get(`Explanation${l}`)])),
  }
  const at = `row ${n + 2} (${q.id || '?'})`
  if (!/^SATRW-\d{4}$/.test(q.id)) errors.push(`${at}: bad id`)
  if (!DOMAINS[q.domain]?.includes(q.skill)) errors.push(`${at}: unknown domain/skill "${q.domain}" / "${q.skill}"`)
  if (!DIFFICULTIES.includes(q.difficulty)) errors.push(`${at}: bad difficulty "${q.difficulty}"`)
  if (!q.stem) errors.push(`${at}: missing question`)
  if (!LETTERS.includes(q.correctChoice)) errors.push(`${at}: bad CorrectAnswer "${q.correctChoice}"`)
  for (const l of LETTERS) {
    if (!q.choices[l]) errors.push(`${at}: missing choice ${l}`)
    if (!q.explanations[l]) errors.push(`${at}: missing explanation ${l}`)
  }
  return q
})
if (questions.length !== 1000) errors.push(`expected 1000 questions, found ${questions.length}`)
if (new Set(questions.map((q) => q.id)).size !== questions.length) errors.push('duplicate question ids')

if (errors.length) {
  console.error(`Question bank validation failed (${errors.length}):\n` + errors.slice(0, 25).join('\n'))
  process.exit(1)
}

const outDir = resolve(here, '../src/bank')
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'question-bank.json'), JSON.stringify(questions))
if (ndjson) writeFileSync(resolve(outDir, 'question-bank.ndjson'), questions.map((q) => JSON.stringify(q)).join('\n') + '\n')
console.log(`Wrote ${questions.length} questions from ${csvPath}`)
