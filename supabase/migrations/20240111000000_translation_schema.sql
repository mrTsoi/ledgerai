-- ============================================================================
-- Dynamic Translations Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  locale TEXT NOT NULL REFERENCES system_languages(code) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'common', -- e.g., 'common', 'auth', 'navigation'
  key TEXT NOT NULL, -- e.g., 'save', 'login_button'
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(locale, namespace, key)
);

ALTER TABLE app_translations ENABLE ROW LEVEL SECURITY;

-- Only Super Admins can manage translations
CREATE POLICY "Super Admins can manage translations" ON app_translations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
    )
  );

-- Everyone can read translations (needed for the app to function)
CREATE POLICY "Everyone can read translations" ON app_translations
  FOR SELECT USING (true);

-- Function to update updated_at
CREATE TRIGGER set_updated_at_app_translations 
BEFORE UPDATE ON app_translations 
FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Indexes for performance
CREATE INDEX idx_app_translations_locale ON app_translations(locale);
CREATE INDEX idx_app_translations_lookup ON app_translations(locale, namespace, key);
