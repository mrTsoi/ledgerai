-- Allow Super Admins to view all profiles
-- This is required for the Admin > User Subscriptions list to work correctly

CREATE POLICY "Super admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND role = 'SUPER_ADMIN'
      AND is_active = true
    )
  );
