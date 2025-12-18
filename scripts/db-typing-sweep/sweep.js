#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const child = require('child_process')

const ROOT = path.resolve(__dirname, '../../')
const DB_TYPES = path.join(ROOT, 'src', 'types', 'database.types.ts')
const SRC = path.join(ROOT, 'src')

function readFile(p) { return fs.readFileSync(p, 'utf8') }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf8') }

function getExistingTables(contents) {
  const tablesMatch = contents.match(/Tables:\s*\{([\s\S]*?)\n\s*\}\n\s*Views:/)
  if (!tablesMatch) return new Set()
  const body = tablesMatch[1]
  const re = /^\s*([a-z0-9_]+):\s*\{/gim
  const s = new Set()
  let m
  while ((m = re.exec(body))) s.add(m[1])
  return s
}

function findUsedTables(dir) {
  const files = []
  function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f)
      const st = fs.statSync(fp)
      if (st.isDirectory()) walk(fp)
      else if (/\.tsx?$/.test(f)) files.push(fp)
    }
  }
  walk(dir)

  const used = new Set()
  const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/gi
  for (const f of files) {
    const c = fs.readFileSync(f, 'utf8')
    let m
    while ((m = re.exec(c))) used.add(m[1])
  }
  return used
}

function makeStub(table) {
  return `      ${table}: {
        Row: { [key: string]: Json }
        Insert: { [key: string]: Json }
        Update: { [key: string]: Json }
        Relationships: []
      }
`
}

function insertStubs(stubs) {
  const orig = readFile(DB_TYPES)
  const insertBefore = '\n    Views:'
  const idx = orig.indexOf(insertBefore)
  if (idx === -1) throw new Error('Could not find Views: marker in database.types.ts')
  const head = orig.slice(0, idx)
  const tail = orig.slice(idx)
  const newContent = head + '\n' + stubs.join('\n') + '\n' + tail
  writeFile(DB_TYPES, newContent)
}

function runCommand(cmd) {
  try {
    child.execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
    return 0
  } catch (e) {
    return e.status || 1
  }
}

function main() {
  console.log('DB typing sweep starting...')
  const batchSize = parseInt(process.env.BATCH_SIZE || '8', 10)
  const maxIters = parseInt(process.env.MAX_ITERS || '12', 10)

  let iterations = 0
  while (iterations < maxIters) {
    iterations++
    console.log(`\nIteration ${iterations}`)
    const dbText = readFile(DB_TYPES)
    const existing = getExistingTables(dbText)
    const used = findUsedTables(SRC)
    const missing = [...used].filter(x => !existing.has(x)).sort()
    if (missing.length === 0) {
      console.log('No missing table typings found.')
      break
    }
    const toAdd = missing.slice(0, batchSize)
    console.log('Adding stubs for tables:', toAdd.join(', '))
    const stubs = toAdd.map(makeStub)
    insertStubs(stubs)

    // Run typecheck and tests
    console.log('\nRunning TypeScript typecheck...')
    const tscCode = runCommand('npx tsc --noEmit')
    console.log('\nRunning unit tests...')
    const testCode = runCommand('npm test --silent')

    if (tscCode === 0 && testCode === 0) {
      console.log('Typecheck and tests passed. Sweep finished.')
      return process.exit(0)
    }

    // continue loop to add more stubs
  }

  console.log('Completed iterations. Please review remaining TypeScript errors manually.')
  process.exit(1)
}

main()
