-- Create public storage bucket for marketing assets (hero videos/images)
-- and restrict writes to SUPER_ADMIN while allowing public reads.

-- 1) Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing', 'marketing', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2) Policies (idempotent)
DROP POLICY IF EXISTS "Public read marketing" ON storage.objects;
CREATE POLICY "Public read marketing"
ON storage.objects
FOR SELECT
USING (bucket_id = 'marketing');

DROP POLICY IF EXISTS "Super admin insert marketing" ON storage.objects;
CREATE POLICY "Super admin insert marketing"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'marketing' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admin update marketing" ON storage.objects;
CREATE POLICY "Super admin update marketing"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'marketing' AND public.is_super_admin())
WITH CHECK (bucket_id = 'marketing' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admin delete marketing" ON storage.objects;
CREATE POLICY "Super admin delete marketing"
ON storage.objects
FOR DELETE
USING (bucket_id = 'marketing' AND public.is_super_admin());
