#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function ensureBucket(name) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    const exists = Array.isArray(buckets) && buckets.find((b) => b.name === name)
    if (exists) {
      console.log(`Bucket '${name}' already exists`)
      return
    }

    const { error } = await supabase.storage.createBucket(name, { public: false })
    if (error) {
      console.error('Failed to create bucket', error.message)
      process.exit(2)
    }
    console.log(`Created bucket '${name}'`)
  } catch (e) {
    console.error('Error ensuring bucket', e)
    process.exit(3)
  }
}

await ensureBucket('thumbnails')
console.log('Done')
