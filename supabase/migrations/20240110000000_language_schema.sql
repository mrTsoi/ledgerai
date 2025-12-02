-- ============================================================================
-- Language Management Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_languages (
  code TEXT PRIMARY KEY, -- e.g., 'en', 'zh-CN'
  name TEXT NOT NULL, -- e.g., 'English', 'Chinese (Simplified)'
  flag_emoji TEXT, -- e.g., '🇺🇸'
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE system_languages ENABLE ROW LEVEL SECURITY;

-- Only Super Admins can manage languages
CREATE POLICY "Super Admins can manage languages" ON system_languages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
    )
  );

-- Everyone can read active languages
CREATE POLICY "Everyone can read active languages" ON system_languages
  FOR SELECT USING (is_active = true);

-- Seed initial languages
INSERT INTO system_languages (code, name, flag_emoji, is_active, is_default)
VALUES 
  ('en', 'English', '🇺🇸', true, true),
  ('zh-CN', '简体中文', '🇨🇳', true, false),
  ('zh-TW', '繁體中文', '🇹🇼', true, false)
ON CONFLICT (code) DO NOTHING;
