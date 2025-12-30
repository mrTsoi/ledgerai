-- Team invites via Supabase Auth
--
-- When an admin uses Supabase Auth "invite user" flow, Supabase creates an auth.users row
-- immediately. We leverage the existing on-auth-user-created trigger function to:
-- - ensure a profiles row exists
-- - optionally create a tenant membership when invite metadata is present
--
-- Invite metadata keys (set by server invite API):
-- - invited_tenant_id: UUID
-- - invited_role: one of COMPANY_ADMIN, ACCOUNTANT, OPERATOR

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invited_tenant UUID;
  invited_role TEXT;
BEGIN
  -- Create profile for every new auth user
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  -- Optionally create membership when user was invited to a tenant
  invited_role := UPPER(COALESCE(NULLIF(NEW.raw_user_meta_data->>'invited_role', ''), ''));

  BEGIN
    invited_tenant := NULLIF(NEW.raw_user_meta_data->>'invited_tenant_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    invited_tenant := NULL;
  END;

  IF invited_tenant IS NOT NULL
     AND invited_role IN ('COMPANY_ADMIN', 'ACCOUNTANT', 'OPERATOR')
     AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = invited_tenant)
  THEN
    INSERT INTO public.memberships (user_id, tenant_id, role, is_active)
    VALUES (NEW.id, invited_tenant, invited_role, true)
    ON CONFLICT (user_id, tenant_id) DO UPDATE
      SET role = EXCLUDED.role,
          is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
