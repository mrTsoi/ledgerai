# Database Migration Order

Run these migrations in your Supabase SQL Editor in this exact order:

## ⚠️ IMPORTANT: Run the Fix First!

If you're getting 500 errors about `is_active` column, run this FIRST:

### Step 0: Fix Missing Columns (if needed)
```bash
File: supabase/migrations/20240106000000_fix_missing_columns.sql
```
This ensures all required columns exist before running other migrations.

## 📋 Migration Sequence

### 1. Initial Schema (Phase 1)
```bash
File: supabase/migrations/20240101000000_initial_schema.sql
```
Creates:
- tenants table
- profiles table
- memberships table
- Basic RLS policies

### 2. Documents Schema (Phase 2)
```bash
File: supabase/migrations/20240102000000_documents_schema.sql
```
Creates:
- documents table
- document_data table
- ai_providers table
- tenant_ai_configurations table

### 3. Accounting Schema (Phase 3)
```bash
File: supabase/migrations/20240103000000_accounting_schema.sql
```
Creates:
- chart_of_accounts table
- transactions table
- line_items table
- seed_chart_of_accounts() function
- Validation triggers

### 4. Reports Schema (Phase 4)
```bash
File: supabase/migrations/20240104000000_reports_schema.sql
```
Creates:
- account_balances materialized view
- Financial reporting functions
- report_templates table
- saved_reports table

### 5. Admin Schema (Phase 5)
```bash
File: supabase/migrations/20240105000000_admin_schema.sql
```
Creates:
- system_settings table
- audit_logs table
- tenant_statistics table
- Admin functions
- Audit triggers

## 🔍 Verification

After running all migrations, verify with:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check all functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
```

## 🐛 Troubleshooting

### Error: "column is_active does not exist"
**Solution:** Run migration #0 (fix_missing_columns.sql) first

### Error: "relation already exists"
**Solution:** That migration was already run, skip to the next one

### Error: "permission denied"
**Solution:** Make sure you're running as the database owner or have superuser access

### Error: "function does not exist"
**Solution:** Run the migrations in order - some depend on previous ones

## 🧪 Test After Migrations

```sql
-- Test: Create a test tenant
INSERT INTO tenants (name, slug, locale) 
VALUES ('Test Company', 'test-company', 'en')
RETURNING *;

-- Test: Seed chart of accounts (use tenant id from above)
SELECT seed_chart_of_accounts('<tenant-id>');

-- Test: Check account balances
SELECT * FROM account_balances LIMIT 5;

-- Test: Admin functions (as SUPER_ADMIN)
SELECT * FROM get_system_overview();
```

## ✅ Success Checklist

- [ ] All 5 migrations completed without errors
- [ ] All tables show `rowsecurity = true`
- [ ] At least 1 tenant exists
- [ ] Chart of accounts seeded
- [ ] Can access `/admin` as SUPER_ADMIN
- [ ] No 500 errors in browser console
