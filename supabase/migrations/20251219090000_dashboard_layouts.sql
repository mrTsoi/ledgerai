-- Dashboard personalization and templates

-- Per-user per-tenant per-template overrides
CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  layout_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, user_id, template_key)
);

-- Tenant-wide published defaults per template
CREATE TABLE IF NOT EXISTS public.tenant_dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  layout_json jsonb NOT NULL,
  published_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, template_key)
);

-- Per-user preferences (selected template per tenant)
CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  selected_template_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (tenant_id, user_id)
);

-- Enable RLS
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_preferences ENABLE ROW LEVEL SECURITY;

-- updated_at triggers (function is created in initial schema)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS set_updated_at_dashboard_layouts ON public.dashboard_layouts;
    CREATE TRIGGER set_updated_at_dashboard_layouts
      BEFORE UPDATE ON public.dashboard_layouts
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_tenant_dashboard_layouts ON public.tenant_dashboard_layouts;
    CREATE TRIGGER set_updated_at_tenant_dashboard_layouts
      BEFORE UPDATE ON public.tenant_dashboard_layouts
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

    DROP TRIGGER IF EXISTS set_updated_at_dashboard_preferences ON public.dashboard_preferences;
    CREATE TRIGGER set_updated_at_dashboard_preferences
      BEFORE UPDATE ON public.dashboard_preferences
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- Policies: dashboard_layouts (per-user)
DROP POLICY IF EXISTS "Users can view their dashboard layouts" ON public.dashboard_layouts;
CREATE POLICY "Users can view their dashboard layouts" ON public.dashboard_layouts
  FOR SELECT USING (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_layouts.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "Users can insert their dashboard layouts" ON public.dashboard_layouts;
CREATE POLICY "Users can insert their dashboard layouts" ON public.dashboard_layouts
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_layouts.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "Users can update their dashboard layouts" ON public.dashboard_layouts;
CREATE POLICY "Users can update their dashboard layouts" ON public.dashboard_layouts
  FOR UPDATE USING (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_layouts.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "Users can delete their dashboard layouts" ON public.dashboard_layouts;
CREATE POLICY "Users can delete their dashboard layouts" ON public.dashboard_layouts
  FOR DELETE USING (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_layouts.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

-- Policies: dashboard_preferences (per-user)
DROP POLICY IF EXISTS "Users can view their dashboard preferences" ON public.dashboard_preferences;
CREATE POLICY "Users can view their dashboard preferences" ON public.dashboard_preferences
  FOR SELECT USING (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_preferences.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "Users can upsert their dashboard preferences" ON public.dashboard_preferences;
CREATE POLICY "Users can upsert their dashboard preferences" ON public.dashboard_preferences
  FOR ALL USING (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_preferences.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  ) WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = dashboard_preferences.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

-- Policies: tenant_dashboard_layouts (tenant-wide published defaults)
DROP POLICY IF EXISTS "Members can view tenant dashboard layouts" ON public.tenant_dashboard_layouts;
CREATE POLICY "Members can view tenant dashboard layouts" ON public.tenant_dashboard_layouts
  FOR SELECT USING (
    (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = tenant_dashboard_layouts.tenant_id
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS "Admins can manage tenant dashboard layouts" ON public.tenant_dashboard_layouts;
CREATE POLICY "Admins can manage tenant dashboard layouts" ON public.tenant_dashboard_layouts
  FOR ALL USING (
    (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = tenant_dashboard_layouts.tenant_id
          AND m.role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  ) WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.tenant_id = tenant_dashboard_layouts.tenant_id
          AND m.role IN ('COMPANY_ADMIN', 'SUPER_ADMIN')
          AND m.is_active = true
      )
      OR public.is_super_admin()
    )
  );
