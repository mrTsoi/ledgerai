-- ============================================================================
-- MIGRATION FIX: Ensure all required columns exist
-- Run this BEFORE Phase 5 migration if you get 500 errors
-- ============================================================================

-- 1. Add is_active to tenants if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.tenants ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;
    UPDATE public.tenants SET is_active = true WHERE is_active IS NULL;
    RAISE NOTICE 'Added is_active column to tenants table';
  ELSE
    RAISE NOTICE 'is_active column already exists in tenants table';
  END IF;
END $$;

-- 2. Add is_active to memberships if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.memberships ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;
    UPDATE public.memberships SET is_active = true WHERE is_active IS NULL;
    RAISE NOTICE 'Added is_active column to memberships table';
  ELSE
    RAISE NOTICE 'is_active column already exists in memberships table';
  END IF;
END $$;

-- 3. Verify all required columns exist
DO $$
DECLARE
  missing_columns TEXT := '';
BEGIN
  -- Check tenants columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'is_active') THEN
    missing_columns := missing_columns || 'tenants.is_active, ';
  END IF;
  
  -- Check memberships columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'memberships' AND column_name = 'is_active') THEN
    missing_columns := missing_columns || 'memberships.is_active, ';
  END IF;
  
  IF missing_columns != '' THEN
    RAISE EXCEPTION 'Missing columns: %', missing_columns;
  ELSE
    RAISE NOTICE 'All required columns exist!';
  END IF;
END $$;

-- 4. Show current schema
SELECT 
  table_name, 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('tenants', 'memberships') 
  AND column_name IN ('is_active', 'role', 'user_id', 'tenant_id')
ORDER BY table_name, ordinal_position;
