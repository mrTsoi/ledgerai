// Simple test uploader for the 'marketing' bucket using the SUPABASE_SERVICE_ROLE_KEY
// Usage: SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node tmp/test-upload-hero.js /absolute/path/to/video.mp4

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node tmp/test-upload-hero.js /path/to/video.mp4');
    process.exit(2);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    process.exit(2);
  }

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }

  const stat = fs.statSync(filePath);
  const maxBytes = 100 * 1024 * 1024; // 100 MB
  if (stat.size === 0 || stat.size > maxBytes) {
    console.error('File size must be >0 and <= 100MB');
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const fileName = `hero/test-${Date.now()}${path.extname(filePath) || '.mp4'}`;
  const fileBuffer = fs.readFileSync(filePath);

  console.log('Uploading to bucket marketing as', fileName);
  const { data, error } = await supabase.storage.from('marketing').upload(fileName, fileBuffer, {
    contentType: 'video/mp4',
    upsert: false,
    cacheControl: '3600'
  });

  if (error) {
    console.error('Upload error:', error);
    process.exit(1);
  }

  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/marketing/${data.path}`;
  console.log('Upload successful. Public URL:');
  console.log(publicUrl);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
