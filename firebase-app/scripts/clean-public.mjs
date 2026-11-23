// Removes the previous build output from ../firebase-public, leaving SPEC.md,
// Firestore config, etc. untouched.
import { rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const pub = resolve(dirname(fileURLToPath(import.meta.url)), '../../firebase-public')
for (const p of ['assets', 'index.html', 'favicon.svg']) rmSync(resolve(pub, p), { recursive: true, force: true })
