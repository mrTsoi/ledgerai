import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const dumpFile = '.tmp_public_schema.sql';

  // Requires Docker Desktop because Supabase CLI runs pg_dump inside a container.
  run('supabase', ['db', 'dump', '--linked', '--schema', 'public', '--file', dumpFile]);

  const sql = await fs.readFile(dumpFile, 'utf8');

  // Strong-ish proof via DDL: table exists, RLS is enabled, and there are no policies for it.
  // (Runtime proof is handled by scripts/check-cron-secrets-rls.mjs using PostgREST).

  const tableMention = /external_sources_cron_secrets/;
  assert(tableMention.test(sql), 'external_sources_cron_secrets not found in dumped schema (migration may not be applied).');

  const rlsEnabled = /ALTER TABLE\s+(?:ONLY\s+)?("public"\.)?"external_sources_cron_secrets"\s+ENABLE ROW LEVEL SECURITY;/;
  assert(
    rlsEnabled.test(sql),
    'RLS is not enabled for external_sources_cron_secrets in dumped schema.'
  );

  const policiesForTable = /CREATE POLICY[\s\S]*?ON\s+(?:"public"\.)?"external_sources_cron_secrets"\b/;
  assert(
    !policiesForTable.test(sql),
    'Found a CREATE POLICY for external_sources_cron_secrets; deny-all RLS expectation violated.'
  );

  console.log('OK: Schema dump confirms RLS enabled and no policies for external_sources_cron_secrets.');
  console.log('Next: run `node scripts/check-cron-secrets-rls.mjs` to verify PostgREST blocks anon/authenticated.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
