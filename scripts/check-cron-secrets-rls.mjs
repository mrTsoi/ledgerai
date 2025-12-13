import fs from 'node:fs/promises';

function parseEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result[key] = value;
  }
  return result;
}

async function requestStatus(url, apiKey) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const bodyText = await res.text();
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = null;
  }
  return { status: res.status, bodyText, json };
}

async function main() {
  const envText = await fs.readFile(new URL('../.env.local', import.meta.url), 'utf8');
  const env = parseEnv(envText);

  const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !anonKey || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  const endpoint = `${baseUrl}/rest/v1/external_sources_cron_secrets?select=tenant_id&limit=5`;

  const anon = await requestStatus(endpoint, anonKey);
  const service = await requestStatus(endpoint, serviceKey);

  const anonRows = Array.isArray(anon.json) ? anon.json.length : null;
  const serviceRows = Array.isArray(service.json) ? service.json.length : null;

  console.log(`anon status: ${anon.status} rows: ${anonRows ?? 'n/a'}`);
  console.log(`service_role status: ${service.status} rows: ${serviceRows ?? 'n/a'}`);

  if (service.status >= 200 && service.status < 300) {
    console.log('OK: service_role can access external_sources_cron_secrets (table exists and is accessible server-side).');
  } else {
    console.log('WARNING: service_role cannot access external_sources_cron_secrets. Response body follows:');
    console.log(service.bodyText);
  }

  if (!(anon.status >= 200 && anon.status < 300)) {
    console.log('OK: anon request is denied at HTTP layer.');
    console.log(anon.bodyText);
    return;
  }

  if (anonRows === null) {
    console.log('WARNING: anon returned a non-JSON response; cannot assess row visibility. Body follows:');
    console.log(anon.bodyText);
    return;
  }

  if (anonRows > 0) {
    console.log('FAIL: anon can see rows in external_sources_cron_secrets (RLS/policies likely allow access).');
    return;
  }

  if (serviceRows === null) {
    console.log('NOTE: service_role response was not JSON; cannot compare visibility reliably.');
    return;
  }

  if (serviceRows > 0) {
    console.log('OK: service_role sees rows, anon sees none (deny-all RLS behavior confirmed at runtime).');
  } else {
    console.log('NOTE: service_role sees no rows either, so this does not conclusively prove deny-all RLS (table may just be empty).');
    console.log('Tip: After generating a tenant cron key in Settings, rerun this script to verify anon still sees 0 rows.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
