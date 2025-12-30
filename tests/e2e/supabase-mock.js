const express = require('express')
const bodyParser = require('body-parser')
const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

const PORT = process.env.PORT || 54321

// simple in-memory store
const profiles = new Map()
const user_subscriptions = new Map()

function parseEqQuery(q) {
  // q like stripe_subscription_id=eq.<id>
  const [k, v] = q.split('=')
  if (!v) return null
  if (v.startsWith('eq.')) return { key: k, value: decodeURIComponent(v.slice(3)) }
  return null
}

app.post('/rest/v1/profiles', (req, res) => {
  console.log('[supabase-mock] POST /rest/v1/profiles', req.body)
  const id = req.body.id || `p_${Date.now()}`
  const item = { id, email: req.body.email }
  profiles.set(id, item)
  // return representation if asked
  res.status(201).json([item])
})

app.get('/rest/v1/profiles', (req, res) => {
  console.log('[supabase-mock] GET /rest/v1/profiles', req.query)
  const q = Object.keys(req.query)[0]
  if (q) {
    const parsed = parseEqQuery(`${q}=${req.query[q]}`)
    if (parsed) {
      const row = profiles.get(parsed.value)
      return res.json(row ? [row] : [])
    }
  }
  return res.json(Array.from(profiles.values()))
})

app.delete('/rest/v1/profiles', (req, res) => {
  console.log('[supabase-mock] DELETE /rest/v1/profiles', req.query)
  const q = Object.keys(req.query)[0]
  if (q) {
    const parsed = parseEqQuery(`${q}=${req.query[q]}`)
    if (parsed) {
      profiles.delete(parsed.value)
      return res.status(200).json([])
    }
  }
  profiles.clear()
  res.status(200).json([])
})

app.get('/rest/v1/user_subscriptions', (req, res) => {
  console.log('[supabase-mock] GET /rest/v1/user_subscriptions', req.query)
  const q = Object.keys(req.query)[0]
  if (q) {
    const parsed = parseEqQuery(`${q}=${req.query[q]}`)
    if (parsed) {
      const row = user_subscriptions.get(parsed.value)
      return res.json(row ? [row] : [])
    }
  }
  return res.json(Array.from(user_subscriptions.values()))
})

app.delete('/rest/v1/user_subscriptions', (req, res) => {
  console.log('[supabase-mock] DELETE /rest/v1/user_subscriptions', req.query)
  const q = Object.keys(req.query)[0]
  if (q) {
    const parsed = parseEqQuery(`${q}=${req.query[q]}`)
    if (parsed) {
      user_subscriptions.delete(parsed.value)
      return res.status(200).json([])
    }
  }
  user_subscriptions.clear()
  res.status(200).json([])
})

// Provide a simple endpoint the app can call to insert user_subscriptions (used by webhook handler)
app.post('/rest/v1/user_subscriptions', (req, res) => {
  console.log('[supabase-mock] POST /rest/v1/user_subscriptions', req.body)
  const id = `us_${Date.now()}`
  const item = Object.assign({ id }, req.body)
  if (item.stripe_subscription_id) user_subscriptions.set(item.stripe_subscription_id, item)
  res.status(201).json([item])
})

app.listen(PORT, () => {
  console.log(`Supabase-mock listening on http://localhost:${PORT}`)
})
