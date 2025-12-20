const fs = require('node:fs')
const crypto = require('node:crypto')

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

function isProbablyHumanString(s) {
  const v = String(s ?? '').trim()
  if (v.length < 3) return false
  if (v.length > 200) return false
  if (!/[A-Za-z]/.test(v)) return false
  if (/^(bg-|text-|px-|py-|mt-|mb-|mx-|my-|grid|flex|items-|justify-)/.test(v)) return false
  if (/^https?:\/\//.test(v)) return false
  if (/^[A-Z0-9_]+$/.test(v)) return false
  if (/\.(tsx?|css|json|png|jpg|svg)$/.test(v)) return false
  if (v.includes('`') || v.includes('${')) return false
  return true
}

const filePath = 'src/components/team/team-list.tsx'
const raw = fs.readFileSync(filePath, 'utf8')
const lines = raw.split(/\r?\n/)

const out = []
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (line.includes('Invite New Member')) {
    console.log('LINE', i + 1, line)
    const ltReDbg = /\blt\(\s*(["'`])([^"'`]{2,200})\1\s*\)/g
    console.log('REGEX', ltReDbg.source)
    console.log('EXEC', ltReDbg.exec(line))
  }
  if (line.includes('useTranslations(') || line.includes("t('")) continue

  const ltRe = /\blt\(\s*(["'`])([^"'`]{2,200})\1\s*\)/g
  let m
  while ((m = ltRe.exec(line))) {
    const text = String(m[2] ?? '').replace(/\s+/g, ' ').trim()
    if (text === 'Invite New Member') {
      console.log('HUMAN?', isProbablyHumanString(text))
    }
    if (!isProbablyHumanString(text)) continue
    out.push({ line: i + 1, text, key: literalKeyFromText(text) })
  }
}

console.log('MATCHES', out.filter((x) => x.text.toLowerCase().includes('invite')))
