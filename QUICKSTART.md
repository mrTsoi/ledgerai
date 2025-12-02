# Quick Start Guide - LedgerAI

## ⚡ Get Started in 5 Minutes

### Step 1: Set Up Supabase Project (2 minutes)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click "New Project" and fill in:
   - Project Name: `ledgerai`
   - Database Password: (choose a strong password)
   - Region: (select closest to you)
3. Wait for project to initialize (~2 minutes)
4. Go to **Project Settings** > **API**
5. Copy these values:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key

### Step 2: Configure Environment Variables (1 minute)

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and paste your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

### Step 3: Run Database Migrations (2 minutes)

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor** (left sidebar)

#### Run Phase 1 Migration
3. Copy the entire content from `supabase/migrations/20240101000000_initial_schema.sql`
4. Paste into the SQL Editor
5. Click "Run" button

This creates core tables (tenants, profiles, memberships).

#### Run Phase 2 Migration
6. Copy the entire content from `supabase/migrations/20240102000000_documents_schema.sql`
7. Paste into the SQL Editor
8. Click "Run" button

This creates document management and AI configuration tables.

### Step 3.5: Set Up Document Storage (1 minute)

1. In Supabase Dashboard, go to **Storage**
2. Click **"New bucket"**
3. Enter:
   - Name: `documents`
   - Public: **Unchecked** (private)
   - File size limit: 50 MB
4. Click **"Create bucket"**
5. Go to **Storage** > **Policies** > select `documents` bucket
6. Run the storage policies from `supabase/STORAGE_SETUP.md` in SQL Editor

(See `supabase/STORAGE_SETUP.md` for detailed policy SQL)

### Step 4: Start the Development Server (1 minute)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 5: Create Your First Account

1. Click "Sign up" or go to `/signup`
2. Fill in your details:
   - Full Name
   - Email
   - Password (minimum 6 characters)
3. Click "Sign Up"
4. You'll be redirected to the dashboard

### Step 6: Create Your First Tenant

Since you're the first user, you need to create a tenant manually:

1. Go to your Supabase dashboard > **SQL Editor**
2. Run this SQL (replace `<your-email>` with your actual email):

```sql
-- Get your user ID
SELECT id, email FROM auth.users WHERE email = '<your-email>';

-- Create your first tenant (copy the returned ID)
INSERT INTO tenants (name, slug, locale)
VALUES ('My Company', 'my-company', 'en')
RETURNING id;

-- Create membership (replace user_id and tenant_id with your values)
INSERT INTO memberships (user_id, tenant_id, role)
VALUES ('<user-id>', '<tenant-id>', 'COMPANY_ADMIN');
```

3. Refresh your dashboard page
4. You should now see "My Company" in the tenant selector

## 🎉 You're Ready!

You now have:
- ✅ A working Next.js 14 application
- ✅ Supabase authentication
- ✅ Multi-tenant architecture
- ✅ Role-based access control
- ✅ Professional dashboard layout
- ✅ Document upload with drag-and-drop
- ✅ Document management with real-time updates
- ✅ AI processing service structure (ready for integration)

## 🧪 Test Phase 2 Features

1. **Upload a Document**
   - Go to Dashboard > Documents
   - Drag and drop a PDF, image, or spreadsheet
   - Watch real-time upload progress
   - Document appears in the list instantly

2. **View Document Details**
   - Documents show status (UPLOADED, PROCESSING, PROCESSED, FAILED)
   - Real-time updates via Supabase Realtime
   - Download and delete capabilities

3. **AI Processing (Mock)**
   - Documents are automatically marked for processing
   - Mock AI extraction creates sample data
   - Check `document_data` table in Supabase for extracted info

## 📝 Next Steps

### Phase 3: Add Accounting Core
- Create Chart of Accounts
- Implement transactions and line items
- Build reconciliation UI
- Link documents to transactions

### Phase 4: Financial Reporting
- Add multi-lingual support (next-intl)
- Create P&L and Balance Sheet reports
- Build PostgreSQL views for reporting
- Export functionality (PDF/CSV)

### Phase 5: Integrate Real AI
Replace the mock AI service with actual providers:
- OpenAI GPT-4 Vision
- Anthropic Claude
- Azure Document Intelligence
- Google Cloud Document AI

See `src/lib/ai/document-processor.ts` for integration guide.

See the full roadmap in `README.md`.

## 🐛 Common Issues

### "Supabase client error"
- Check that `.env.local` exists and has correct values
- Restart the dev server after changing `.env.local`

### "No tenants showing"
- Ensure you ran Step 6 to create a tenant and membership
- Check that your user_id and tenant_id are correct UUIDs

### "Authentication not working"
- Verify environment variables are set correctly
- Check Supabase Auth is enabled in your project
- Look at browser console for error messages

## 🚀 Production Deployment

Ready to deploy? See the deployment section in `README.md` for:
- Vercel deployment guide
- Production environment setup
- Security checklist

---

**Need Help?** Check the comprehensive `README.md` or the Supabase documentation.
