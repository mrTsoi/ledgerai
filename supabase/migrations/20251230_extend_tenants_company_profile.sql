-- Migration: Extend tenants table for company profile fields
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS company_address TEXT,
  ADD COLUMN IF NOT EXISTS company_type TEXT, -- Limited Company, Sole proprietor, Partnership
  ADD COLUMN IF NOT EXISTS company_telephone TEXT,
  ADD COLUMN IF NOT EXISTS company_email TEXT,
  ADD COLUMN IF NOT EXISTS shareholders TEXT[],
  ADD COLUMN IF NOT EXISTS directors TEXT[],
  ADD COLUMN IF NOT EXISTS year_end_date DATE,
  ADD COLUMN IF NOT EXISTS first_year_of_engagement INT,
  ADD COLUMN IF NOT EXISTS business_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS certificate_of_incorporation_number TEXT,
  ADD COLUMN IF NOT EXISTS billing_method TEXT,
  ADD COLUMN IF NOT EXISTS first_contact_person TEXT,
  ADD COLUMN IF NOT EXISTS first_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS first_contact_telephone TEXT,
  ADD COLUMN IF NOT EXISTS first_contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS first_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS second_contact_person TEXT,
  ADD COLUMN IF NOT EXISTS second_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS second_contact_telephone TEXT,
  ADD COLUMN IF NOT EXISTS second_contact_mobile TEXT,
  ADD COLUMN IF NOT EXISTS second_contact_email TEXT;
