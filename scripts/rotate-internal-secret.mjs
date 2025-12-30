#!/usr/bin/env node
import { readFile, writeFile, copyFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import { join } from 'path'

async function main() {
  const envPath = join(process.cwd(), '.env.local')
  let content = ''
  try {
    content = await readFile(envPath, 'utf8')
  } catch (e) {
    console.error('Failed to read .env.local:', e.message || e)
    process.exit(1)
  }

  // Backup current file
  const backupPath = `${envPath}.bak.${Date.now()}`
  try {
    await copyFile(envPath, backupPath)
  } catch (e) {
    console.error('Failed to backup .env.local:', e.message || e)
    process.exit(1)
  }

  // Generate a new 32-byte hex secret
  const newSecret = randomBytes(32).toString('hex')

  const re = /^INTERNAL_SECURITY_SECRET=.*$/m
  let newContent = ''
  if (re.test(content)) {
    newContent = content.replace(re, `INTERNAL_SECURITY_SECRET=${newSecret}`)
  } else {
    // Append to end
    newContent = content.trimEnd() + '\n' + `INTERNAL_SECURITY_SECRET=${newSecret}` + '\n'
  }

  try {
    await writeFile(envPath, newContent, 'utf8')
  } catch (e) {
    console.error('Failed to write .env.local:', e.message || e)
    // Try to restore backup
    try { await copyFile(backupPath, envPath) } catch (_) {}
    process.exit(1)
  }

  console.log('INTERNAL_SECURITY_SECRET rotated successfully.')
  console.log('New secret (copy and update deployment/CI secrets):')
  console.log(newSecret)
  console.log(`Backup saved to: ${backupPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
