-- ============================================================================
-- Add zh-HK locale and migrate legacy zh-TW
-- ============================================================================

-- 1) Ensure zh-HK exists (required by app_translations.locale FK)
INSERT INTO system_languages (code, name, flag_emoji, is_active, is_default)
VALUES ('zh-HK', '繁體中文 (香港)', '🇭🇰', true, false)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    flag_emoji = EXCLUDED.flag_emoji,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 2) Best-effort: copy any existing translations from legacy zh-TW into zh-HK
-- (does not overwrite if zh-HK already has the key)
INSERT INTO app_translations (locale, namespace, key, value)
SELECT 'zh-HK', namespace, key, value
FROM app_translations
WHERE locale = 'zh-TW'
ON CONFLICT (locale, namespace, key) DO NOTHING;

-- 3) Optional: disable legacy zh-TW in language picker (kept for URL redirect compatibility)
UPDATE system_languages
SET is_active = false,
    updated_at = NOW()
WHERE code = 'zh-TW';
