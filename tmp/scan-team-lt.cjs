const fs = require('node:fs')
const crypto = require('node:crypto')

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

const raw = fs.readFileSync('src/components/team/team-list.tsx', 'utf8')
const re = /\blt\(\s*(["'])([^"']{2,200})\1\s*\)/g
const matches = [...raw.matchAll(re)].map((m) => m[2])

const invite = matches.filter((t) => t.includes('Invite'))
console.log({ totalLtCalls: matches.length, invite, key: literalKeyFromText('Invite New Member') })
