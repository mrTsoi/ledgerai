# Phase 5 Fixes: Billing & Promo Codes

## 1. Yearly Prices & Promo Code Migration
If the automatic migration failed, run this SQL in the Supabase SQL Editor to backfill yearly prices and create the initial promo code:

```sql
-- Update yearly prices based on the configured discount percentage
-- If yearly_discount_percent is NULL, default to 20%
-- Force update all paid plans
UPDATE subscription_plans 
SET 
  yearly_discount_percent = COALESCE(yearly_discount_percent, 20),
  price_yearly = ROUND(price_monthly * 12 * (1 - COALESCE(yearly_discount_percent, 20) / 100.0), 2)
WHERE name != 'Free';

-- Ensure Free plan is 0
UPDATE subscription_plans 
SET price_yearly = 0, yearly_discount_percent = 0
WHERE name = 'Free';

-- Insert XMAS2025 promo code if not exists
INSERT INTO promo_codes (code, description, discount_type, discount_value, valid_until, max_uses, is_active)
SELECT 'XMAS2025', 'Christmas Special 2025', 'PERCENTAGE', 25, '2025-12-31', 100, true
WHERE NOT EXISTS (SELECT 1 FROM promo_codes WHERE code = 'XMAS2025');
```

## 2. Admin Permissions Fix (Subscriptions List)
If the Admin > User Subscriptions list is empty, run this SQL to allow admins to view user profiles:

```sql
CREATE POLICY "Super admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );
```

## 3. Stripe Promo Code Sync
We have added a **"Sync to Stripe"** button in the Admin > Promo Codes panel.
- **Why?** Creating a code in the database does not automatically create it in Stripe. Stripe Checkout requires the code to exist in Stripe's system.
- **How to use:** 
  1. Go to Admin Dashboard > Settings > Promo Codes.
  2. Click "Sync to Stripe".
  3. This will send all active codes from the database to Stripe as Coupons and Promotion Codes.

## 3. Yearly Billing
- The Checkout API now supports `price_yearly`.
- If `price_yearly` is set in the database, it uses that.
- If not set, it falls back to `price_monthly * 12`.
- The "Yearly" toggle in the pricing page now correctly passes `interval: 'year'` to the checkout.
