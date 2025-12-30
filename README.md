# LedgerAI - AI-Powered Multi-Tenant Accounting Platform

![LedgerAI](https://img.shields.io/badge/Status-Phase%205%20In%20Progress-yellow)
![Next.js](https://img.shields.io/badge/Next.js-15.0-black)
![Supabase](https://img.shields.io/badge/Supabase-Enabled-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

**CodeName:** LedgerAI  
**Objective:** Production-ready, multi-tenant SaaS platform that automates accounting workflows using AI

## 🚀 Project Overview

LedgerAI is a comprehensive accounting platform designed to serve individual companies, accounting firms, and platform administrators. Built with modern technologies and AI capabilities, it automates accounting workflows, document processing, and financial reporting.

### Key Features

- **Multi-Tenancy**: Secure, isolated data per tenant using Supabase Row-Level Security (RLS)
- **AI-Powered Processing**: Automated document extraction and categorization
- **Role-Based Access Control**: COMPANY_ADMIN, ACCOUNTANT, OPERATOR, SUPER_ADMIN roles
- **Real-Time Collaboration**: Supabase Realtime for live updates
- **Financial Reporting**: P&L, Balance Sheet, Cash Flow reports
- **Multi-Lingual Support**: English, Chinese (Simplified & Traditional)

## 🛠️ Technical Stack

- **Frontend**: Next.js 14 (App Router), React 19, TypeScript
- **UI Framework**: Tailwind CSS, Shadcn/UI, Radix UI
- **Backend & Database**: Supabase (PostgreSQL, Auth, Storage, RLS, Realtime)
- **Authentication**: Supabase Auth with email/password
- **AI & Processing**: TBD (To be integrated via Platform Admin)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- Node.js 18+ and npm
- Git
- A Supabase account ([supabase.com](https://supabase.com))

## 🔧 Installation & Setup

### 1. Clone the Repository

\`\`\`bash
git clone <repository-url>
cd 55act
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Set Up Supabase Project

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Project Settings** > **API** and copy:
   - Project URL
   - Anon (public) key
   - Service role key (keep this secret!)

### 4. Configure Environment Variables

Create a \`.env.local\` file in the root directory:

\`\`\`bash
cp .env.local.example .env.local
\`\`\`

Edit \`.env.local\` with your Supabase credentials:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=your-database-url
\`\`\`

### 5. Run Database Migrations

Execute the SQL migrations in your Supabase SQL Editor:

#### Phase 1 Migration (Core Tables)
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the content from `supabase/migrations/20240101000000_initial_schema.sql`
4. Paste and run the SQL script

This creates:
- `tenants` table with RLS policies
- `profiles` table with automatic user profile creation
- `memberships` table for user-tenant relationships
- Necessary indexes and triggers

#### Phase 2 Migration (Document Management)
1. In the **SQL Editor**, copy the content from `supabase/migrations/20240102000000_documents_schema.sql`
2. Paste and run the SQL script

This creates:
- `documents` table for file metadata
- `document_data` table for AI-extracted data
- `ai_providers` table for AI service configuration
- `tenant_ai_configurations` table for tenant-specific AI settings
- All necessary RLS policies and indexes

#### Phase 2 Storage Setup
Follow the guide in `supabase/STORAGE_SETUP.md` to:
1. Create the `documents` storage bucket
2. Set up RLS policies for secure file access
3. Configure file path structure

#### Phase 3 Migration (Accounting Core)
1. In the **SQL Editor**, copy the content from `supabase/migrations/20240103000000_accounting_schema.sql`
2. Paste and run the SQL script

This creates:
- `chart_of_accounts` table with hierarchical structure
- `transactions` table with status tracking (DRAFT, POSTED, VOID)
- `line_items` table for double-entry bookkeeping
- `seed_chart_of_accounts()` function to initialize default accounts
- `check_transaction_balance()` trigger to validate double-entry
- `trial_balance` view for balance verification
- All necessary RLS policies and indexes

#### Seed Default Chart of Accounts (Phase 3)
After running the migration, seed the default accounts:

\`\`\`sql
-- In Supabase SQL Editor, run for each tenant
SELECT seed_chart_of_accounts('<your-tenant-id>');
\`\`\`

This will create a standard chart of accounts with:
- Assets (Cash, Accounts Receivable, Inventory, Fixed Assets)
- Liabilities (Accounts Payable, Notes Payable)
- Equity (Capital, Retained Earnings)
- Revenue (Sales, Service Revenue)
- Expenses (COGS, Salaries, Rent, Utilities)

#### Phase 4 Migration (Financial Reporting)
1. In the **SQL Editor**, copy the content from `supabase/migrations/20240104000000_reports_schema.sql`
2. Paste and run the SQL script

This creates:
- Materialized view for account balances with auto-refresh triggers
- `get_trial_balance()` function for trial balance report
- `get_profit_loss()` function for P&L statement
- `get_balance_sheet()` function for balance sheet
- `get_net_income()` function for net income calculation
- `get_account_activity()` function for account detail
- `report_templates` and `saved_reports` tables for future features
- All necessary permissions and RLS policies

#### Phase 5 Migration (Platform Admin)
1. In the **SQL Editor**, copy the content from `supabase/migrations/20240105000000_admin_schema.sql`
2. Paste and run the SQL script

This creates:
- `system_settings` table for platform-wide configurations
- `audit_logs` table with automatic trigger for tracking all changes
- `tenant_statistics` table with auto-update triggers
- `get_system_overview()` function for super admin dashboard
- `get_tenant_details()` function for detailed tenant information
- Admin-specific RLS policies (SUPER_ADMIN access only)
- Automatic audit logging and statistics updates

### 6. Start the Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

\`\`\`
55act/
├── .github/
│   └── copilot-instructions.md    # GitHub Copilot instructions
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── api/                   # API routes
│   │   │   └── documents/         # Document processing API
│   │   ├── login/                 # Login page
│   │   ├── signup/                # Signup page
│   │   ├── admin/                 # Super admin dashboard
│   │   ├── dashboard/             # Protected dashboard routes
│   │   │   ├── documents/         # Document management page
│   │   │   ├── transactions/      # Transactions page
│   │   │   ├── accounts/          # Chart of Accounts page
│   │   │   ├── reports/           # Financial reports page
│   │   │   └── ...
│   │   ├── globals.css            # Global styles
│   │   ├── layout.tsx             # Root layout
│   │   └── page.tsx               # Home page
│   ├── components/
│   │   ├── auth/                  # Authentication components
│   │   │   ├── login-form.tsx
│   │   │   └── signup-form.tsx
│   │   ├── dashboard/             # Dashboard components
│   │   │   └── dashboard-layout.tsx
│   │   ├── admin/                 # Admin components
│   │   │   ├── system-overview.tsx
│   │   │   ├── tenant-management.tsx
│   │   │   └── audit-log-viewer.tsx
│   │   ├── documents/             # Document components
│   │   │   ├── document-upload.tsx
│   │   │   └── documents-list.tsx
│   │   ├── transactions/          # Transaction components
│   │   │   ├── transaction-editor.tsx
│   │   │   └── transactions-list.tsx
│   │   ├── accounts/              # Account components
│   │   │   └── chart-of-accounts.tsx
│   │   ├── reports/               # Report components
│   │   │   ├── trial-balance-report.tsx
│   │   │   ├── profit-loss-report.tsx
│   │   │   └── balance-sheet-report.tsx
│   │   └── ui/                    # Shadcn/UI components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       └── tabs.tsx
│   ├── hooks/
│   │   └── use-tenant.tsx         # Tenant management hooks
│   ├── i18n/                      # Internationalization
│   │   ├── en.json                # English translations
│   │   ├── zh-CN.json             # Chinese Simplified
│   │   └── zh-TW.json             # Chinese Traditional
│   ├── lib/
│   │   ├── ai/                    # AI processing services
│   │   │   └── document-processor.ts
│   │   ├── supabase/              # Supabase client utilities
│   │   │   ├── client.ts          # Browser client
│   │   │   ├── server.ts          # Server client
│   │   │   ├── middleware.ts      # Auth middleware
│   │   │   └── service.ts         # Service role client
│   │   └── utils.ts               # Utility functions
│   ├── types/
│   │   └── database.types.ts      # TypeScript types for database
│   └── middleware.ts              # Next.js middleware
├── supabase/
│   ├── config.toml                # Supabase local config
│   ├── STORAGE_SETUP.md           # Storage setup guide
│   └── migrations/
│       ├── 20240101000000_initial_schema.sql
│       ├── 20240102000000_documents_schema.sql
│       ├── 20240103000000_accounting_schema.sql
│       ├── 20240104000000_reports_schema.sql
│       └── 20240105000000_admin_schema.sql
├── .env.local.example             # Environment variables template
├── components.json                # Shadcn/UI configuration
├── next.config.ts                 # Next.js configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
\`\`\`

## 🔐 Authentication Flow

1. **Signup**: User creates account at \`/signup\`
2. **Profile Creation**: Automatic profile creation via database trigger
3. **Login**: User authenticates at \`/login\`
4. **Middleware**: Auth middleware protects dashboard routes
5. **Tenant Selection**: User selects/switches between tenants
6. **Role-Based Access**: Navigation filtered by user role

## 👥 User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| **SUPER_ADMIN** | Platform administrator | Full access to all tenants and admin panel |
| **COMPANY_ADMIN** | Tenant administrator | Manage tenant settings, users, and all data |
| **ACCOUNTANT** | Accounting professional | View and manage transactions, reports |
| **OPERATOR** | Data entry operator | Upload documents, basic operations |

## 🗄️ Database Schema

### Core Tables

#### tenants
- Stores tenant/company information
- RLS policies ensure data isolation

#### profiles
- Extends Supabase Auth users
- Automatically created on user signup

#### memberships
- Junction table linking users to tenants
- Defines user roles per tenant
- Enables multi-tenant access

#### documents (Phase 2)
- Stores document metadata and file references
- Links to Supabase Storage
- Tracks processing status (UPLOADED, PROCESSING, PROCESSED, FAILED)

#### document_data (Phase 2)
- Stores AI-extracted structured data from documents
- Includes vendor info, dates, amounts, line items
- Confidence scores and metadata

#### ai_providers (Phase 2)
- Configuration for AI service providers
- Managed by Super Admins
- Supports OpenAI, Anthropic, Azure, Google Cloud

#### tenant_ai_configurations (Phase 2)
- Tenant-specific AI provider settings
- Encrypted API keys
- Custom model configurations

#### chart_of_accounts (Phase 3)
- Hierarchical account structure
- Account types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
- Subtypes for detailed categorization
- Current balance tracking

#### transactions (Phase 3)
- Accounting journal entries
- Status tracking: DRAFT, POSTED, VOID
- Links to source documents
- Audit trail with created/posted timestamps

#### line_items (Phase 3)
- Double-entry bookkeeping line items
- Debit and credit columns
- Links to chart of accounts
- Transaction validation via triggers

#### system_settings (Phase 5)
- Platform-wide configuration settings
- Key-value pairs with data types
- SUPER_ADMIN management only
- Default settings seeded on creation

#### audit_logs (Phase 5)
- Comprehensive change tracking
- Captures user actions, old/new data
- IP address and metadata logging
- Automatic trigger on critical tables
- Retention and compliance features

#### tenant_statistics (Phase 5)
- Aggregated tenant metrics
- User, document, transaction counts
- Financial summaries (revenue, expenses, net income)
- Auto-updated via triggers
- Performance optimization for admin dashboard

## 🚦 Development Phases

### ✅ Phase 1: Foundation (COMPLETED)
- [x] Next.js 14 project setup
- [x] Supabase integration
- [x] Shadcn/UI components
- [x] Authentication (login/signup)
- [x] Multi-tenancy with RLS
- [x] Dashboard layout with role-based navigation

### ✅ Phase 2: Document Management (COMPLETED)
- [x] Supabase Storage setup with RLS
- [x] Document upload with drag-and-drop
- [x] Documents table and management UI
- [x] Real-time document updates
- [x] AI processing service structure
- [x] Document data extraction placeholder

### 🔧 Phase 3: Accounting Core (COMPLETED)
- [x] Database schema (chart_of_accounts, transactions, line_items)
- [x] Double-entry validation triggers
- [x] AI integration for draft transaction creation
- [x] Transaction editor with line item management
- [x] Transactions list page with status filters
- [x] Chart of Accounts management UI
- [x] Complete RLS policies for all accounting tables

### 👑 Phase 5: Platform Admin (IN PROGRESS)
- [x] Admin database schema (system_settings, audit_logs, tenant_statistics)
- [x] System overview dashboard with platform statistics
- [x] Tenant management UI (create, edit, activate/deactivate)
- [x] Audit log viewer with filtering and CSV export
- [x] Admin page with tabbed interface
- [ ] User management across tenants
- [ ] AI provider configuration UI
- [ ] System health monitoring

### 🚀 Phase 6: Production Deployment (UPCOMING)
- [ ] Security hardening
- [ ] Performance optimization
- [ ] Production deployment
- [ ] Monitoring and logging

## 🧪 Testing the Application

### Create Your First Tenant

1. **Sign up** for an account at `/signup`
2. After signup, you'll be redirected to the dashboard
3. **Create a tenant** (this will be automated in a future phase):

\`\`\`sql
-- Run this in Supabase SQL Editor
-- Replace <user_id> with your actual user ID from auth.users table

INSERT INTO tenants (name, slug, locale)
VALUES ('My Company', 'my-company', 'en')
RETURNING id;

-- Copy the returned tenant id and use it below
INSERT INTO memberships (user_id, tenant_id, role)
VALUES ('<your-user-id>', '<tenant-id-from-above>', 'COMPANY_ADMIN');
\`\`\`

4. **Initialize Chart of Accounts**:

\`\`\`sql
-- Run this in Supabase SQL Editor
SELECT seed_chart_of_accounts('<tenant-id-from-above>');
\`\`\`

5. Refresh the dashboard to see your tenant

### Test Document Processing to Transactions

1. Navigate to **Documents** page
2. Upload an invoice or receipt (PDF, image, or Excel)
3. The document will be processed by the AI service (currently mock)
4. Navigate to **Transactions** page to see the draft transaction
5. Click **Edit** to review the transaction details
6. Review the line items and account mappings
7. Click **Post Transaction** to finalize

### Test Chart of Accounts

1. Navigate to **Accounts** page
2. View the default account structure
3. Add new accounts with custom codes and names
4. Edit or deactivate existing accounts
5. Organize accounts hierarchically

### Test Financial Reports

1. Navigate to **Reports** page
2. Select a report type (Trial Balance, P&L, or Balance Sheet)
3. Choose date range or as-of-date
4. Click **Generate Report**
5. Review the financial data
6. Export to CSV for further analysis
7. Verify totals and balances

**Available Reports:**
- **Trial Balance**: View all account balances, verify debits = credits
- **Profit & Loss**: View revenue and expenses for a period, calculate net income
- **Balance Sheet**: View assets, liabilities, and equity at a specific date

### Test Multi-Language Support

The platform includes translations for:
- English (en)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)

Note: Language switching UI will be added in a future phase.

### Test Platform Admin (SUPER_ADMIN only)

1. Grant yourself SUPER_ADMIN role:

\`\`\`sql
-- Run this in Supabase SQL Editor
UPDATE memberships
SET role = 'SUPER_ADMIN'
WHERE user_id = '<your-user-id>';
\`\`\`

2. Navigate to **Admin Panel** from the sidebar
3. **System Overview** tab shows:
   - Total and active tenants
   - Total users across platform
   - Total documents and transactions
   - Storage usage and growth rate
4. **Tenant Management** tab:
   - Create new tenants with slug and locale
   - View detailed tenant statistics
   - Activate/deactivate tenants
   - See financial summaries per tenant
5. **Audit Logs** tab:
   - Filter by action type, user, date range
   - View all system changes with old/new data
   - Export logs to CSV
   - Track user activity across platform

## 🛠️ Available Scripts

\`\`\`bash
# Development
npm run dev          # Start development server


## Testing notes

- `use-batch-config` behavior: the hook fetches batch configuration from `/api/batch-processing/config` using an absolute URL constructed from `window.location.origin` in the browser. In server or test environments where `window` is not available, the hook will attempt to use `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, or `VERCEL_URL` to build the URL. If none are available (common in Node-based tests), the hook skips the network fetch and falls back to safe defaults (e.g. `batchSize = 5`).

- If you want tests to exercise real network behavior, set `NEXT_PUBLIC_BASE_URL` (or `NEXT_PUBLIC_APP_URL`) in your test environment to a valid URL.
# Production
npm run build        # Build for production
npm run start        # Start production server

# Linting
npm run lint         # Run ESLint
\`\`\`

## 🔒 Security Best Practices

1. **Never commit \`.env.local\`** - Contains sensitive credentials
2. **Service Role Key** - Only use server-side, never expose to client
3. **RLS Policies** - All tables have Row-Level Security enabled
4. **Authentication** - Protected routes via middleware
5. **Input Validation** - Validate all user inputs

## 📚 Documentation Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Shadcn/UI Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

## 🤝 Contributing

This is a private project. For questions or contributions, please contact the project owner.

## 📄 License

Proprietary - All Rights Reserved

## 🐛 Known Issues & Troubleshooting

### Issue: "Cannot find module '@supabase/ssr'"
**Solution**: Run \`npm install\` to ensure all dependencies are installed.

### Issue: Middleware redirect loop
**Solution**: Ensure \`.env.local\` has correct Supabase credentials.

### Issue: No tenants showing in dashboard
**Solution**: Manually create a tenant and membership (see Testing section).

## 📞 Support

For support and questions:
- Check the [Issues](link-to-issues) page
- Review the documentation in \`.github/copilot-instructions.md\`
- Contact: [your-email]

---

**Built with ❤️ using Next.js 14 and Supabase**
