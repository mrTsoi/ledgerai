-- Add OpenRouter Provider with Free Vision Models
INSERT INTO ai_providers (name, display_name, is_active, config) VALUES
  (
    'openrouter', 
    'OpenRouter (Aggregator)', 
    true, 
    '{
      "supported_types": ["invoice", "receipt", "general"], 
      "models": [
        "google/gemini-2.0-flash-exp:free",
        "google/gemini-2.0-flash-thinking-exp:free",
        "google/gemini-exp-1206:free",
        "google/learnlm-1.5-pro-experimental:free",
        "meta-llama/llama-3.2-11b-vision-instruct:free",
        "meta-llama/llama-3.2-90b-vision-instruct:free",
        "qwen/qwen-2-vl-7b-instruct:free",
        "google/gemini-flash-1.5-8b",
        "google/gemini-flash-1.5",
        "openai/gpt-4o-mini"
      ]
    }'
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  config = EXCLUDED.config,
  is_active = true;
