Title: chore: dynamic server wrappers for Document AI & OpenAI

Summary

Introduce runtime-safe, dynamic factories for heavy SDKs and replace top-level imports in runtime code paths. This prevents Node-only globals and native modules from being evaluated during module load in Edge/browser runtimes, reduces bundle size for serverless targets, and keeps CI green.

Key changes

- Added `src/integrations/google/documentai-client.ts` — dynamic factory for `@google-cloud/documentai`.
- Added `src/lib/ai/openai-client.ts` — dynamic factory for `openai`.
- Updated `src/lib/ai/document-processor.ts` to use the factories instead of top-level imports.
- Updated API routes to use dynamic factories: `src/app/api/ai/test/route.ts`, `src/app/api/admin/ai-test/route.ts`.
- Converted `src/lib/external-sources/sftp.ts` to dynamically import `ssh2-sftp-client` and `path` inside the function.
- Removed a static `openai` import from `src/lib/ai/reconciliation-service.ts` to avoid module-eval Node globals.
- Added audit artifacts (in `tmp/`) `node-mods-scan.json` and `node-mods-priority.json` used to prioritize which packages to isolate next.

Why this change

- Some dependencies access `process.*`, `fs`, or `net` during module eval; when imported from modules that run in Edge or the browser build, this can cause warnings or build/runtime failures. Deferring `require`/`import()` to runtime server-only code prevents these failures and keeps serverless/Edge bundles small.

Testing performed

- `npm run build` — production build completed successfully.
- `npm test` — full test suite: 24 files, 41 tests — all passed.

Notes for reviewers

- Review the new factories (`src/integrations/google/documentai-client.ts`, `src/lib/ai/openai-client.ts`) and the call-site changes in `src/lib/ai/document-processor.ts` and API routes.
- Verify API routes that instantiate SDKs are intended to run in Node runtimes (routes using these factories should be server-side; consider `export const runtime = 'nodejs'` where applicable).
- The `tmp` audit files are intentionally included for reviewer context; they can be removed before merge if desired.

Risk & rollback

- Risk: Low. These are import-scope changes; business logic is unchanged. To rollback: revert branch `feat/dynamic-server-wrappers`.

Branch

- `feat/dynamic-server-wrappers` (pushed to origin)

How to test locally

```bash
# build
npm run build
# tests
npm test
```

Next steps

- I can mark this PR ready for review and add suggested reviewers, or keep it as a draft while we convert additional hotspots (e.g., `@grpc/grpc-js`, `@google-cloud/*`) if you prefer.

If you want me to proceed, I can update the PR state and add reviewers now.