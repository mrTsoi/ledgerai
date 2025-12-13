import fs from 'node:fs/promises';
import crypto from 'node:crypto';

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

async function httpJson({ url, apiKey, method = 'GET', body }) {
  const res = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
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

  const tenantsUrl = `${baseUrl}/rest/v1/tenants?select=id&limit=1`;
  const tenantsRes = await httpJson({ url: tenantsUrl, apiKey: serviceKey });
  if (!(tenantsRes.status >= 200 && tenantsRes.status < 300) || !Array.isArray(tenantsRes.json)) {
    throw new Error(`Failed to fetch a tenant id via service role. status=${tenantsRes.status} body=${tenantsRes.text}`);
  }

  const tenantId = tenantsRes.json[0]?.id;
  if (!tenantId) {
    console.log('No tenants found in the database; cannot perform runtime write/read RLS proof.');
    return;
  }

  const cronSelectUrl = `${baseUrl}/rest/v1/external_sources_cron_secrets?tenant_id=eq.${tenantId}&select=tenant_id&limit=5`;
  const beforeService = await httpJson({ url: cronSelectUrl, apiKey: serviceKey });
  const beforeAnon = await httpJson({ url: cronSelectUrl, apiKey: anonKey });

  const beforeServiceRows = Array.isArray(beforeService.json) ? beforeService.json.length : null;
  const beforeAnonRows = Array.isArray(beforeAnon.json) ? beforeAnon.json.length : null;

  console.log(`Before -> service_role status=${beforeService.status} rows=${beforeServiceRows ?? 'n/a'} ; anon status=${beforeAnon.status} rows=${beforeAnonRows ?? 'n/a'}`);

  let inserted = false;

  if (beforeServiceRows === 0) {
    const token = crypto.randomBytes(8).toString('hex');
    const insertUrl = `${baseUrl}/rest/v1/external_sources_cron_secrets`;
    const payload = {
      tenant_id: tenantId,
      enabled: false,
      default_run_limit: 1,
      key_prefix: `test_${token}`,
      key_hash: `test_${token}`,
    };

    const insertRes = await httpJson({ url: insertUrl, apiKey: serviceKey, method: 'POST', body: payload });
    if (!(insertRes.status >= 200 && insertRes.status < 300)) {
      throw new Error(`Failed to insert test row via service role. status=${insertRes.status} body=${insertRes.text}`);
    }

    inserted = true;
    console.log('Inserted a temporary test row (service_role).');
  } else {
    console.log('A cron secrets row already exists for this tenant; skipping insert and using existing data for runtime visibility check.');
  }

  const afterService = await httpJson({ url: cronSelectUrl, apiKey: serviceKey });
  const afterAnon = await httpJson({ url: cronSelectUrl, apiKey: anonKey });

  const afterServiceRows = Array.isArray(afterService.json) ? afterService.json.length : null;
  const afterAnonRows = Array.isArray(afterAnon.json) ? afterAnon.json.length : null;

  console.log(`After  -> service_role status=${afterService.status} rows=${afterServiceRows ?? 'n/a'} ; anon status=${afterAnon.status} rows=${afterAnonRows ?? 'n/a'}`);

  if (afterServiceRows && afterServiceRows > 0 && afterAnonRows === 0) {
    console.log('OK: Runtime proof passed (service_role can see row; anon sees 0 rows).');
  } else if (afterAnonRows && afterAnonRows > 0) {
    console.log('FAIL: anon can see rows in external_sources_cron_secrets (unexpected for deny-all).');
  } else {
    console.log('NOTE: Inconclusive runtime proof (table may still be empty or responses not JSON).');
  }

  if (inserted) {
    const deleteUrl = `${baseUrl}/rest/v1/external_sources_cron_secrets?tenant_id=eq.${tenantId}`;
    const del = await httpJson({ url: deleteUrl, apiKey: serviceKey, method: 'DELETE' });
    if (!(del.status >= 200 && del.status < 300) && del.status !== 204) {
      throw new Error(`Failed to delete temp test row. status=${del.status} body=${del.text}`);
    }
    console.log('Cleaned up temporary test row.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
