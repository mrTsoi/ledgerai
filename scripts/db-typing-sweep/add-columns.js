#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../')
const SRC = path.join(ROOT, 'src')
const DB_TYPES = path.join(ROOT, 'src', 'types', 'database.types.ts')

function walk(dir, cb) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, cb)
    else if (/\.tsx?$/.test(name)) cb(p)
  }
}

function collectFieldUsages() {
  const usages = {} // table -> Set(fields)
  const fromRe = /\.from\(\s*['\"]([a-z0-9_]+)['\"]\s*\)/gi
  const selectRe = /\.select\(\s*(['\"])([\s\S]*?)\1/gi
  const eqRe = /\.eq\(\s*['\"]([a-z0-9_]+)['\"]\s*,/gi

  walk(SRC, (file) => {
    const c = fs.readFileSync(file, 'utf8')
    const froms = []
    let m
    while ((m = fromRe.exec(c))) froms.push({ name: m[1], idx: m.index })
    if (froms.length === 0) return

    // For each from occurrence, scan following text for select/eq nearby
    for (const f of froms) {
      // slice after from position
      const tail = c.slice(f.idx)
      const table = f.name
      usages[table] = usages[table] || new Set()

      // collect select columns if present
      let ms
      while ((ms = selectRe.exec(tail))) {
        // ms[2] is the select argument, could be '*' or 'col1, col2' or "col1"
        const cols = ms[2].trim()
        if (cols === '*' || cols.startsWith('{')) break
        // remove options object if passed as second arg
        const fields = cols.split(',').map(s => s.replace(/["'\s]/g, '').trim()).filter(Boolean)
        for (const fld of fields) usages[table].add(fld)
        break
      }

      // collect eq uses in tail until next semicolon or end of statement
      const eqIter = tail.matchAll(eqRe)
      for (const em of eqIter) usages[table].add(em[1])
    }
  })
  return usages
}

function readDbTypes() {
  return fs.readFileSync(DB_TYPES, 'utf8')
}

function writeDbTypes(text) {
  fs.writeFileSync(DB_TYPES, text, 'utf8')
}

function parseTables(text) {
  // crude: find `Tables: {` section and for each `name:` capture block start/end
  const tables = {}
  const match = text.match(/Tables:\s*\{([\s\S]*?)\n\s*\}\n\s*Views:/)
  if (!match) return tables
  const body = match[1]
  const re = /(^\s*)([a-z0-9_]+):\s*\{([\s\S]*?)(^\s*\})/gim
  let m
  while ((m = re.exec(body))) {
    const name = m[2]
    // approximate: locate in original text
    const idx = text.indexOf(`${name}: {`)
    if (idx === -1) continue
    tables[name] = { start: idx }
  }
  return tables
}

function addFieldsToTable(text, table, fields) {
  // find Row: { ... } for the table and inject missing fields
  const tableRe = new RegExp(`(${table}:\\s*\\{[\\s\\S]*?Row:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\}\\n)`, 'm')
  const m = text.match(tableRe)
  if (!m) return text
  const pre = m[1]
  const body = m[2]
  const post = m[3]

  const existing = new Set()
  const lineRe = /([a-z0-9_]+)\s*:\s*([^\n]+)/gi
  let lm
  while ((lm = lineRe.exec(body))) existing.add(lm[1])

  const toAdd = []
  for (const f of fields) {
    if (existing.has(f)) continue
    // infer type
    let t = 'string | null'
    if (/id$/.test(f) || /^id$/.test(f)) t = 'string'
    else if (/amount|price|rate|total|count|number|balance/.test(f)) t = 'number | null'
    else if (/is_|^is|active|enabled|verified/.test(f)) t = 'boolean | null'
    else if (/raw|metadata|data|json|line_items/.test(f)) t = 'Json'
    else if (/date|_at$|created_at|updated_at|statement_date|document_date/.test(f)) t = 'string | null'

    toAdd.push(`          ${f}: ${t}`)
  }

  if (toAdd.length === 0) return text
  const newBody = body + '\n' + toAdd.join('\n') + '\n'
  return text.replace(tableRe, pre + newBody + post)
}

function main() {
  console.log('Collecting field usages...')
  const usages = collectFieldUsages()
  const dbText = readDbTypes()

  let newText = dbText
  let totalAdded = 0
  for (const [table, fldSet] of Object.entries(usages)) {
    const fields = Array.from(fldSet)
    if (fields.length === 0) continue
    newText = addFieldsToTable(newText, table, fields)
  }

  if (newText !== dbText) {
    writeDbTypes(newText)
    console.log('Updated', DB_TYPES)
  } else console.log('No changes required')
}

main()
