const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  console.error('Please ensure you have your Service Role Key (not Anon Key) in .env.local for this script to work.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function setNested(target, pathStr, value) {
  const parts = String(pathStr || '').split('.').filter(Boolean);
  if (parts.length === 0) return;

  let cur = target;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === parts.length - 1) {
      cur[p] = value;
      return;
    }
    if (!cur[p] || typeof cur[p] !== 'object') {
      cur[p] = {};
    }
    cur = cur[p];
  }
}

async function syncTranslations() {
  console.log('🔄 Fetching translations from database...');
  
  // 1. Fetch all translations (paginate; PostgREST commonly caps at ~1000 rows per request)
  const translations = []
  const pageSize = 1000
  for (let offset = 0; offset < 1000000; offset += pageSize) {
    const { data, error } = await supabase
      .from('app_translations')
      .select('*')
      .order('id')
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('Error fetching translations:', error)
      return
    }

    if (data && data.length > 0) {
      translations.push(...data)
    }

    if (!data || data.length < pageSize) {
      break
    }
  }

  if (!translations || translations.length === 0) {
    console.log('✅ No translations to sync.');
    return;
  }

  console.log(`Found ${translations.length} translations to sync.`);

  // 2. Group by locale
  const updatesByLocale = {};
  
  translations.forEach(t => {
    if (!updatesByLocale[t.locale]) {
      updatesByLocale[t.locale] = [];
    }
    updatesByLocale[t.locale].push(t);
  });

  // 3. Update files
  for (const locale of Object.keys(updatesByLocale)) {
    const filePath = path.join(__dirname, '..', 'src', 'i18n', `${locale}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: File for locale ${locale} not found at ${filePath}. Creating it.`);
      fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
    }

    let fileContent = {};
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      fileContent = JSON.parse(raw);
    } catch (e) {
      console.error(`Error reading/parsing ${filePath}:`, e);
      continue;
    }

    const updates = updatesByLocale[locale];
    let updateCount = 0;

    updates.forEach(t => {
      if (!fileContent[t.namespace]) {
        fileContent[t.namespace] = {};
      }
      // Support nested keys via dot-notation in the DB (e.g. key=tabs.overview)
      setNested(fileContent[t.namespace], t.key, t.value);
      updateCount++;
    });

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    console.log(`✅ Updated ${locale}.json with ${updateCount} changes.`);
  }

  // 4. Clear database
  // NOTE: Deleting with a single `.in('id', [...])` can exceed URL/query limits and return “Bad Request”.
  console.log('🗑️ Clearing synced translations from database...');
  const ids = translations.map(t => t.id).filter(Boolean)
  const deleteBatchSize = 200
  let deleted = 0
  let hadDeleteError = false

  for (let i = 0; i < ids.length; i += deleteBatchSize) {
    const batchIds = ids.slice(i, i + deleteBatchSize)
    const { error: deleteError } = await supabase
      .from('app_translations')
      .delete()
      .in('id', batchIds)

    if (deleteError) {
      hadDeleteError = true
      console.error(`Error clearing database (batch ${i}–${Math.min(i + deleteBatchSize, ids.length)}):`, deleteError)
      // Continue attempting remaining batches.
      continue
    }

    deleted += batchIds.length
  }

  if (hadDeleteError) {
    console.error('⚠️ Some translations could not be deleted. The JSON files were updated, but the DB may still contain rows.')
  } else {
    console.log(`✅ Database cleared (${deleted} rows). Changes are now permanent in JSON files.`);
  }
}

syncTranslations();
