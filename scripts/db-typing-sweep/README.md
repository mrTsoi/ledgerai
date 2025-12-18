DB Typing Sweep
================

What it does
------------

- Scans the `src` tree for `.from('table_name')` usages.
- Compares those table names to the keys present in `src/types/database.types.ts` under `public.Tables`.
- Adds minimal typing stubs for missing tables in batches so the compiler can progress.
- After adding a batch, runs `npx tsc --noEmit` and `npm test --silent` to validate.

Usage
-----

Run the sweep (from repo root):

```bash
node scripts/db-typing-sweep/sweep.js
```

Environment variables
---------------------

- `BATCH_SIZE` (optional, default `8`) — how many missing tables to stub per iteration.
- `MAX_ITERS` (optional, default `12`) — max iterations to perform.

Notes and limitations
---------------------

- This script creates permissive stubs (`Row/Insert/Update` use `Json` index signatures). These are placeholders to unblock the type sweep — they should be replaced with precise shapes later.
- The script intentionally does not modify RPC/function typings; those must be added manually where RPC overload errors appear.
- After the sweep completes, revert any temporary `any` or `as any` uses introduced earlier and refine stubs into strict types.

Safety
------

The script edits `src/types/database.types.ts` automatically — commit or review changes before pushing.
