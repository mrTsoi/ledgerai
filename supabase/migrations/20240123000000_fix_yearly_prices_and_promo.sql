-- Update yearly prices based on the configured discount percentage
-- If yearly_discount_percent is NULL, default to 20%
-- REMOVED WHERE CLAUSE to force update all plans
UPDATE subscription_plans 
SET 
  yearly_discount_percent = COALESCE(yearly_discount_percent, 20),
  price_yearly = ROUND(price_monthly * 12 * (1 - COALESCE(yearly_discount_percent, 20) / 100.0), 2)
WHERE name != 'Free';

-- Ensure Free plan is 0
UPDATE subscription_plans 
SET price_yearly = 0, yearly_discount_percent = 0
WHERE name = 'Free';

-- Insert the XMAS2025 promo code if it doesn't exist
INSERT INTO promo_codes (code, description, discount_type, discount_value, max_uses, valid_until)
VALUES ('XMAS2025', 'Christmas Special 2025', 'PERCENTAGE', 25.00, 100, '2025-12-31 23:59:59+00')
ON CONFLICT (code) DO NOTHING;
