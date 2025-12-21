# Phase 6: AI Core & Platform Enhancement Roadmap

## Executive Summary
The platform currently has a robust foundation for **Multi-tenancy**, **Billing**, and **Administration**. The next phase must focus on the "AI" and "Accounting" core value propositions to justify the subscription pricing and drive user retention.

## Proposed Feature Enhancements

### 1. AI-Powered Document Processing (OCR)
**The "Killer Feature"**
- **Functionality:** Users upload receipts/invoices (PDF/Image). The system automatically extracts:
  - Vendor Name
  - Date
  - Total Amount
  - Tax Amount
  - Line Items
- **Integration:** Automatically creates a "Draft Transaction" populated with this data.
- **Tech:** OpenRouter, DeepSeek, OpenAI GPT-4o with Vision or Google Document AI.

### 2. Smart Bank Reconciliation
**The "Sticky Feature"**
- **Functionality:** Users upload bank statements (PDF/CSV/OFX). The system matches statement lines to existing transactions in LedgerAI.
- **AI Component:** "Smart Match" suggests matches based on fuzzy logic (amount + date + description similarity).

### 3. Interactive Financial Reports
**The "Value Feature"**
- **Functionality:** Real-time P&L (Profit & Loss), Balance Sheet, and Cash Flow Statement.
- **Enhancement:** Drill-down capabilities (click a number to see the transactions).
- **AI Component:** "CFO Insights" - An AI agent that analyzes the report and highlights anomalies or trends (e.g., "Marketing spend is up 20% this month").

### 4. Team Collaboration & Roles
**The "Growth Feature"**
- **Functionality:** Allow Tenant Owners to invite team members.
- **Roles:**
  - **Viewer:** Read-only access (for investors/auditors).
  - **Operator:** Can create transactions but not approve.
  - **Accountant:** Full access to financial tools.
  - **Admin:** Full access including billing/users.

---

## Revised Subscription Plans Strategy

We will adjust the plans to monetize based on **Automation (AI)** and **Team Size**, rather than just storage.

### New Plan Structure

| Feature | **Free** | **Agency Starter** | **Agency Pro** | **Enterprise** |
| :--- | :--- | :--- | :--- | :--- |
| **Price** | $0/mo | $49.99/mo | $199.99/mo | Custom |
| **Target** | Solopreneurs | Small Firms | Growing Agencies | Enterprise |
| **Tenants** | 1 | 10 | 50 | Unlimited |
| **Team Members** | 1 (Owner only) | 3 per tenant | 10 per tenant | Unlimited |
| **AI Credits** | 0 | 100 / mo | 1,000 / mo | Unlimited |
| **Documents** | 50 / mo | 1,000 / mo | 10,000 / mo | Unlimited |
| **Bank Feeds** | Manual Import | Auto-Sync | Auto-Sync | Auto-Sync |
| **Support** | Community | Email | Priority | Dedicated |

### Database Changes Required
1. Add `max_users` to `subscription_plans`.
2. Add `monthly_ai_credits` to `subscription_plans`.
3. Update `features` JSONB to include flags for `bank_feeds` and `priority_support`.

---

## Implementation Steps

1. **Database Migration:** Update schema to support new limits.
2. **UI Update:** Update Pricing Page and Billing Settings to show these new limits.
3. **Backend Logic:** Implement enforcement logic for `max_users` and `ai_credits`.
