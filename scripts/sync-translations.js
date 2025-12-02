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

async function syncTranslations() {
  console.log('🔄 Fetching translations from database...');
  
  // 1. Fetch all translations
  const { data: translations, error } = await supabase
    .from('app_translations')
    .select('*');

  if (error) {
    console.error('Error fetching translations:', error);
    return;
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
      // Update the value
      fileContent[t.namespace][t.key] = t.value;
      updateCount++;
    });

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
    console.log(`✅ Updated ${locale}.json with ${updateCount} changes.`);
  }

  // 4. Clear database
  console.log('🗑️ Clearing synced translations from database...');
  const { error: deleteError } = await supabase
    .from('app_translations')
    .delete()
    .in('id', translations.map(t => t.id));

  if (deleteError) {
    console.error('Error clearing database:', deleteError);
  } else {
    console.log('✅ Database cleared. Changes are now permanent in JSON files.');
  }
}

syncTranslations();
