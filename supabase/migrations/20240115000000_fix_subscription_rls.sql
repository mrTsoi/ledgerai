-- Fix RLS policies for user_subscriptions to allow users to manage their own subscriptions (for demo purposes)

-- Allow users to insert their own subscription
CREATE POLICY "Users can insert their own subscription" ON user_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Allow users to update their own subscription
CREATE POLICY "Users can update their own subscription" ON user_subscriptions
  FOR UPDATE USING (user_id = auth.uid());

-- Allow users to delete their own subscription (optional, but good for cleanup)
CREATE POLICY "Users can delete their own subscription" ON user_subscriptions
  FOR DELETE USING (user_id = auth.uid());
