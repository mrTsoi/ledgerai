import crypto from 'node:crypto'

function literalKeyFromText(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hex = crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 12)
  return `literal.${hex}`
}

const inputs = process.argv.slice(2)
if (inputs.length === 0) {
  console.error('Usage: node scripts/print-literal-keys.mjs "Some English text" [more texts...]')
  process.exit(1)
}

for (const text of inputs) {
  console.log(`${literalKeyFromText(text)}\t${String(text)}`)
}
