# Phase 5 Testing Guide - Platform Admin Features

## Prerequisites

1. **Run the Phase 5 Migration**
   - Open [Supabase Dashboard](https://supabase.com/dashboard/project/frjzwdrqknjtpiolblwr)
   - Go to SQL Editor
   - Copy content from `supabase/migrations/20240105000000_admin_schema.sql`
   - Paste and execute

2. **Grant SUPER_ADMIN Role**
   ```sql
   -- In Supabase SQL Editor, run this:
   -- First, find your user_id from auth.users table
   SELECT id, email FROM auth.users;
   
   -- Then update your membership to SUPER_ADMIN
   UPDATE memberships
   SET role = 'SUPER_ADMIN'
   WHERE user_id = '<your-user-id>';
   ```

## Testing Checklist

### 1. System Overview Dashboard ✓

**What to Test:**
- [ ] Navigate to `/admin` page
- [ ] Verify "System Overview" tab is selected by default
- [ ] Check that all 6 stat cards display:
  - Total Tenants
  - Active Tenants
  - Total Users
  - Total Documents
  - Total Transactions
  - Storage Used (GB)
- [ ] Wait 30 seconds to verify auto-refresh works
- [ ] Check growth rate calculation displays correctly

**Expected Results:**
- All metrics should show real numbers from your database
- Dashboard should refresh automatically
- Loading states should appear briefly during refresh

### 2. Tenant Management ✓

**What to Test:**

#### Create New Tenant
- [ ] Click "Tenant Management" tab
- [ ] Click "Create Tenant" button
- [ ] Fill in form:
  - Name: "Test Company ABC"
  - Slug: "test-company-abc"
  - Locale: Select "English"
- [ ] Submit form
- [ ] Verify tenant appears in list

#### View Tenant Details
- [ ] Click "Details" button on any tenant
- [ ] Verify detailed view shows:
  - 4 statistics cards (Users, Documents, Transactions, Net Income)
  - Tenant information (ID, Locale, Created date)
  - Financial metrics (Revenue, Expenses, Last Activity)
- [ ] Click "Close" to return to list

#### Search & Filter
- [ ] Use search box to filter tenants by name
- [ ] Verify filtered results update in real-time

#### Activate/Deactivate Tenant
- [ ] Click "Deactivate" on an active tenant
- [ ] Verify status badge changes from "Active" to "Inactive"
- [ ] Click "Activate" to restore
- [ ] Verify status badge returns to "Active"

**Expected Results:**
- New tenants should be created successfully
- Details view should show accurate statistics
- Search should filter immediately
- Status changes should reflect instantly

### 3. Audit Log Viewer ✓

**What to Test:**

#### View Recent Logs
- [ ] Click "Audit Logs" tab
- [ ] Verify table shows recent system activity
- [ ] Check columns display:
  - Timestamp
  - User (name and email)
  - Action (CREATE, UPDATE, DELETE, etc.)
  - Table name
  - Record ID
  - IP Address
  - Changes (View Details button)

#### Filter Logs
- [ ] Use search box to filter by user email or action
- [ ] Select an action type from "Action" dropdown
- [ ] Set a start date
- [ ] Set an end date
- [ ] Verify results update based on filters
- [ ] Click "Clear Filters" to reset

#### View Change Details
- [ ] Click "View Details" button on a log entry with changes
- [ ] Verify popup/alert shows old and new data in JSON format

#### Export to CSV
- [ ] Click "Export CSV" button
- [ ] Verify CSV file downloads
- [ ] Open CSV and verify it contains:
  - All visible log entries
  - Proper formatting with headers
  - Timestamp, User, Action, Table, etc.

**Expected Results:**
- Logs should display in reverse chronological order (newest first)
- Filters should work correctly
- Action badges should be color-coded
- CSV export should include all filtered results

### 4. Navigation & Security ✓

**What to Test:**

#### Access Control
- [ ] Verify "Admin Panel" link appears in sidebar (SUPER_ADMIN only)
- [ ] Navigate to `/admin` via sidebar link
- [ ] Log out and log in as non-SUPER_ADMIN user
- [ ] Verify "Admin Panel" link is hidden for non-admins
- [ ] Try accessing `/admin` directly (should be blocked by RLS)

#### Navigation Between Tabs
- [ ] Click between all three tabs multiple times
- [ ] Verify content loads properly for each tab
- [ ] Check that state persists when switching tabs
- [ ] Use browser back/forward buttons

**Expected Results:**
- Only SUPER_ADMIN users can see and access admin panel
- Tab switching should be smooth and responsive
- No errors in browser console

### 5. Create Test Data for Better Testing

Run these SQL commands to create test data:

```sql
-- Create additional test tenants
INSERT INTO tenants (name, slug, locale, is_active) VALUES
  ('Demo Company 1', 'demo-company-1', 'en', true),
  ('Demo Company 2', 'demo-company-2', 'zh-CN', true),
  ('Inactive Corp', 'inactive-corp', 'en', false);

-- Create some audit log entries (these will be created automatically, but you can trigger them)
-- Any UPDATE, INSERT, or DELETE on tenants, profiles, or memberships will create logs

-- Update tenant to trigger audit log
UPDATE tenants SET name = 'Demo Company 1 Updated' WHERE slug = 'demo-company-1';

-- Create a membership to trigger audit log
INSERT INTO memberships (user_id, tenant_id, role)
VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  (SELECT id FROM tenants WHERE slug = 'demo-company-1'),
  'ACCOUNTANT'
);
```

### 6. Performance Testing

**What to Test:**
- [ ] Create 5+ tenants
- [ ] Verify System Overview loads quickly
- [ ] Check Tenant Management handles multiple tenants smoothly
- [ ] Generate 20+ audit logs (by making various updates)
- [ ] Verify Audit Logs table scrolls and filters efficiently

### 7. Error Handling

**What to Test:**
- [ ] Try creating tenant with duplicate slug
- [ ] Try creating tenant with invalid slug (spaces, special chars)
- [ ] Try filtering with invalid date ranges
- [ ] Check if error messages display properly

## Common Issues & Solutions

### Issue: Admin Panel link not showing
**Solution:** Ensure your user has SUPER_ADMIN role in memberships table

### Issue: "No data" showing in System Overview
**Solution:** Ensure Phase 5 migration ran successfully and statistics function exists

### Issue: Audit logs not appearing
**Solution:** Check that triggers were created during migration. Make some changes to trigger logs.

### Issue: CSV export not working
**Solution:** Check browser console for errors. Ensure date-fns is installed.

### Issue: Tenant statistics showing zeros
**Solution:** Run the update_tenant_statistics function manually:
```sql
SELECT update_tenant_statistics('<tenant-id>');
```

## Next Steps After Testing

Once all tests pass:
1. Document any bugs or issues found
2. Test with multiple browser tabs open
3. Test on different browsers (Chrome, Firefox, Edge)
4. Test responsive design on mobile/tablet sizes
5. Review console for any warnings or errors
6. Ready for Phase 6: Production Deployment!

## Need Help?

- Check browser console (F12) for errors
- Review Supabase logs in dashboard
- Verify RLS policies are enabled
- Check that all migrations ran successfully
