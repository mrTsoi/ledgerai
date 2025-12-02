-- ============================================================================
-- STORAGE SETUP: Create 'documents' bucket and policies
-- Run this in Supabase SQL Editor to fix "bucket not found" error
-- ============================================================================

-- 0. Ensure Helper Functions Exist (Copied from NUCLEAR_FIX.sql)
CREATE OR REPLACE FUNCTION public.user_has_role(required_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS TABLE(tenant_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT m.tenant_id
  FROM public.memberships m
  WHERE m.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.user_has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids TO authenticated;

-- 1. Create the 'documents' bucket if it doesn't exist
-- NOTE: If this fails with permission errors, create the bucket 'documents' manually in the Supabase Dashboard (Storage > New Bucket)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable RLS on objects
-- NOTE: Commented out because it often causes "must be owner of table objects" error. 
-- RLS is enabled by default on storage.objects.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to avoid conflicts
-- Note: If these fail, you can ignore them or delete policies in the Dashboard
DROP POLICY IF EXISTS "Users can upload to their tenant folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their tenant documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their tenant documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete their tenant documents" ON storage.objects;
DROP POLICY IF EXISTS "Super Admins can access all documents" ON storage.objects;

-- 4. Create Policies using our safe helper functions

-- Policy 1: Upload (INSERT)
CREATE POLICY "Users can upload to their tenant folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.get_user_tenant_ids()
  )
);

-- Policy 2: Read (SELECT)
CREATE POLICY "Users can read their tenant documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.get_user_tenant_ids()
  )
);

-- Policy 3: Update (UPDATE)
CREATE POLICY "Users can update their tenant documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.get_user_tenant_ids()
  )
);

-- Policy 4: Delete (DELETE) - Restricted to Admins
CREATE POLICY "Admins can delete their tenant documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM public.get_user_tenant_ids()
  )
  AND public.user_has_role(ARRAY['COMPANY_ADMIN', 'SUPER_ADMIN'])
);

-- 5. Super Admin Access
CREATE POLICY "Super Admins can access all documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'documents' 
  AND public.user_has_role(ARRAY['SUPER_ADMIN'])
);

-- Verify bucket exists
SELECT id, name, public, created_at FROM storage.buckets WHERE id = 'documents';
