/*
Simple upload tester for /api/admin/marketing/upload-asset
Writes a tiny 1x1 PNG to tmp/test.png and POSTs as multipart/form-data
Requires Node 18+ (global fetch & FormData)
*/
import fs from 'fs'
import path from 'path'

const outDir = path.resolve(process.cwd(), 'tmp')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const pngPath = path.join(outDir, 'test-pixel.png')
// 1x1 PNG base64
const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X5NIAAAAASUVORK5CYII='
fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'))

async function run() {
  const url = 'http://localhost:3000/api/admin/marketing/upload-asset'
  console.log('Posting to', url)

  const form = new FormData()
  // In Node, creating a Blob from the Buffer gives the server a File-like
  // object with `arrayBuffer()` which the upload route expects.
  const buf = fs.readFileSync(pngPath)
  const blob = new Blob([buf], { type: 'image/png' })
  form.append('file', blob, 'test-pixel.png')
  form.append('assetType', 'logo')

  try {
    const res = await fetch(url, { method: 'POST', body: form })
    const text = await res.text()
    console.log('Status:', res.status)
    console.log('Response:', text)
  } catch (e) {
    console.error('Request failed:', e)
  }
}

run()
