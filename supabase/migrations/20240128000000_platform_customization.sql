-- Seed initial platform settings for customization
INSERT INTO system_settings (setting_key, setting_value, description, is_public)
VALUES 
(
  'platform_appearance', 
  '{
    "chatbot": {
      "welcome_message": "Hi! I''m your LedgerAI Assistant. How can I help you today?",
      "primary_color": "blue",
      "position": "bottom-right",
      "icon": "bot",
      "title": "LedgerAI Copilot"
    },
    "landing_page": {
      "hero_title": "AI-Powered Accounting for Modern Business",
      "hero_subtitle": "Automate your bookkeeping, invoices, and financial reporting with the power of AI.",
      "show_features": true
    }
  }'::jsonb,
  'Configuration for platform appearance including chatbot and landing page',
  true
)
ON CONFLICT (setting_key) DO NOTHING;

-- Ensure public access to these specific settings so the frontend can read them without auth (for landing page)
CREATE POLICY "Public can view public system settings"
  ON system_settings FOR SELECT
  USING (is_public = true);
