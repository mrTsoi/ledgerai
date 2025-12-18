
// Minimal, permissive Database type to unblock incremental typing.
// Consolidated Database types — explicit high-impact tables plus a
// single catch-all for remaining tables. Tidy and tighten incrementally.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: {
          id: string
          tenant_id: string
          description: string | null
          reference_number: string | null
          amount: number | null
          transaction_date: string
          status: string | null
          posted_at: string | null
          currency?: string | null
          exchange_rate?: number | null
          notes?: string | null
          documents?: Array<{ id: string; document_data?: { confidence_score?: number; extracted_data?: Json; vendor_name?: string | null; validation_flags?: string[] | null } }>
          line_items?: Array<{ id: string; transaction_id: string; account_id: string | null; debit: number; credit: number; description: string | null }>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          description?: string | null
          reference_number?: string | null
          amount?: number | null
          transaction_date: string
          status?: string | null
          posted_at?: string | null
          currency?: string | null
          exchange_rate?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          description?: string | null
          reference_number?: string | null
          amount?: number | null
          transaction_date?: string
          status?: string | null
          posted_at?: string | null
          currency?: string | null
          exchange_rate?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'transactions_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] }
        ]
      }

      documents: {
        Row: {
          id: string
          tenant_id: string
          file_path: string
          file_name: string
          file_type: string
          file_size: number
          status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type: string | null
          uploaded_by: string | null
          content_hash?: string | null
          processed_at?: string | null
          processed_by?: string | null
          error_message?: string | null
          document_data?: { confidence_score?: number; extracted_data?: Json; vendor_name?: string | null; validation_flags?: string[] | null; line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>; metadata?: Json | null; document_date?: string | null } | null
          validation_status?: string | null
          validation_flags?: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          file_path: string
          file_name: string
          file_type: string
          file_size?: number | null
          status?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type?: string | null
          uploaded_by?: string | null
          content_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          file_path?: string
          file_name?: string
          file_type?: string
          file_size?: number | null
          status?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type?: string | null
          uploaded_by?: string | null
          content_hash?: string | null
          processed_at?: string | null
          processed_by?: string | null
          error_message?: string | null
          validation_status?: string | null
          validation_flags?: string[] | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'documents_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] }
        ]
      }

      document_data: {
        Row: {
          id: string
          document_id: string
          confidence_score: number | null
          extracted_data: Json | null
          vendor_name: string | null
          validation_flags: string[] | null
          metadata?: Json | null
          currency?: string | null
          document_date?: string | null
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          total_amount?: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          document_id: string
          confidence_score?: number | null
          extracted_data?: Json | null
          vendor_name?: string | null
          validation_flags?: string[] | null
          metadata?: Json | null
          currency?: string | null
          document_date?: string | null
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          total_amount?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          confidence_score?: number | null
          extracted_data?: Json | null
          vendor_name?: string | null
          validation_flags?: string[] | null
          metadata?: Json | null
          currency?: string | null
          document_date?: string | null
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          total_amount?: number | null
          created_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'document_data_document_id_fkey', columns: ['document_id'], referencedRelation: 'documents', referencedColumns: ['id'] }
        ]
      }

      line_items: {
        Row: {
          id: string
          transaction_id: string
          account_id: string | null
          debit: number
          credit: number
          description: string | null
        }
        Insert: {
          id?: string
          transaction_id: string
          account_id?: string | null
          debit?: number
          credit?: number
          description?: string | null
        }
        Update: {
          id?: string
          transaction_id?: string
          account_id?: string | null
          debit?: number
          credit?: number
          description?: string | null
        }
        Relationships: [
          { foreignKeyName: 'line_items_transaction_id_fkey', columns: ['transaction_id'], referencedRelation: 'transactions', referencedColumns: ['id'] }
        ]
      }

      bank_accounts: {
        Row: {
          id: string
          tenant_id: string
          account_number: string | null
          account_name?: string | null
          gl_account_id?: string | null
          name: string | null
          bank_name: string | null
          balance: number | null
          currency?: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          account_number?: string | null
          account_name?: string | null
          gl_account_id?: string | null
          name?: string | null
          bank_name?: string | null
          balance?: number | null
          currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          account_number?: string | null
          account_name?: string | null
          gl_account_id?: string | null
          name?: string | null
          bank_name?: string | null
          balance?: number | null
          currency?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'bank_accounts_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] }
        ]
      }

      bank_transactions: {
        Row: {
          id: string
          tenant_id: string
          bank_statement_id: string | null
          bank_account_id: string | null
          transaction_date: string
          description: string | null
          amount: number
          transaction_type: 'DEBIT' | 'CREDIT' | null
          reference_number: string | null
          category: string | null
          status: 'PENDING' | 'MATCHED' | 'EXCLUDED' | null
          matched_transaction_id: string | null
          confidence_score: number | null
          metadata: Json
          raw_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bank_statement_id?: string | null
          bank_account_id?: string | null
          transaction_date: string
          description?: string | null
          amount: number
          transaction_type?: 'DEBIT' | 'CREDIT' | null
          reference_number?: string | null
          category?: string | null
          status?: 'PENDING' | 'MATCHED' | 'EXCLUDED' | null
          matched_transaction_id?: string | null
          confidence_score?: number | null
          metadata?: Json
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bank_statement_id?: string | null
          bank_account_id?: string | null
          transaction_date?: string
          description?: string | null
          amount?: number
          transaction_type?: 'DEBIT' | 'CREDIT' | null
          reference_number?: string | null
          category?: string | null
          status?: 'PENDING' | 'MATCHED' | 'EXCLUDED' | null
          matched_transaction_id?: string | null
          confidence_score?: number | null
          metadata?: Json
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'bank_transactions_bank_statement_id_fkey', columns: ['bank_statement_id'], referencedRelation: 'bank_statements', referencedColumns: ['id'] },
          { foreignKeyName: 'bank_transactions_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] },
          { foreignKeyName: 'bank_transactions_bank_account_id_fkey', columns: ['bank_account_id'], referencedRelation: 'bank_accounts', referencedColumns: ['id'] }
        ]
      }

      billing_invoices: {
        Row: {
          id: string
          user_id: string
          stripe_invoice_id: string
          amount_paid: number
          currency: string
          status: string | null
          invoice_pdf: string | null
          description: string | null
          period_start: string | null
          period_end: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_invoice_id: string
          amount_paid: number
          currency?: string | null
          status?: string | null
          invoice_pdf?: string | null
          description?: string | null
          period_start?: string | null
          period_end?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_invoice_id?: string
          amount_paid?: number
          currency?: string | null
          status?: string | null
          invoice_pdf?: string | null
          description?: string | null
          period_start?: string | null
          period_end?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'billing_invoices_user_id_fkey', columns: ['user_id'], referencedRelation: 'profiles', referencedColumns: ['id'] }
        ]
      }

      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
        }
        Insert: { id?: string; email?: string | null; full_name?: string | null }
        Update: { id?: string; email?: string | null; full_name?: string | null }
        Relationships: []
      }

      tenants: {
        Row: { id: string; name: string; slug: string; locale: string | null; currency?: string | null; created_at: string }
        Insert: { id?: string; name?: string; slug?: string; locale?: string | null; currency?: string | null; created_at?: string }
        Update: { id?: string; name?: string; slug?: string; locale?: string | null; currency?: string | null; created_at?: string }
        Relationships: []
      }

      pending_subscriptions: {
        Row: {
          id: string
          tenant_id: string | null
          email: string
          plan_id: string | null
          interval: 'month' | 'year'
          stripe_price_id: string | null
          token: string
          expires_at: string
          consumed_at: string | null
          consumed_by_user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          email: string
          plan_id?: string | null
          interval?: 'month' | 'year'
          stripe_price_id?: string | null
          token?: string
          expires_at?: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          email?: string
          plan_id?: string | null
          interval?: 'month' | 'year'
          stripe_price_id?: string | null
          token?: string
          expires_at?: string
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'pending_subscriptions_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] }
        ]
      }

      tenant_domains: {
        Row: {
          id: string
          tenant_id: string
          domain: string
          is_primary: boolean
          verified_at?: string | null
          verification_token?: string | null
          created_at?: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          domain: string
          is_primary?: boolean
          verified_at?: string | null
          verification_token?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          domain?: string
          is_primary?: boolean
          verified_at?: string | null
          verification_token?: string | null
          created_at?: string | null
        }
        Relationships: [ { foreignKeyName: 'tenant_domains_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] } ]
      }

      audit_logs: {
        Row: {
          id: string
          tenant_id?: string | null
          user_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          user_email?: string | null
          user_full_name?: string | null
          ip_address?: string | null
          old_data?: Json | null
          new_data?: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          user_email?: string | null
          user_full_name?: string | null
          ip_address?: string | null
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          user_email?: string | null
          user_full_name?: string | null
          ip_address?: string | null
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Relationships: []
      }

      ai_usage_logs: {
        Row: {
          id: string
          tenant_id: string | null
          ai_provider_id: string | null
          model: string | null
          tokens_input: number | null
          tokens_output: number | null
          status: string | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          ai_provider_id?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          status?: string | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          ai_provider_id?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          status?: string | null
          error_message?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'ai_usage_logs_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] }
        ]
      }

      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          status: 'active' | 'canceled' | 'past_due' | 'trial' | null
          current_period_start: string | null
          current_period_end: string | null
          stripe_subscription_id: string | null
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan_id: string
          status?: 'active' | 'canceled' | 'past_due' | 'trial' | null
          current_period_start?: string | null
          current_period_end?: string | null
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plan_id?: string
          status?: 'active' | 'canceled' | 'past_due' | 'trial' | null
          current_period_start?: string | null
          current_period_end?: string | null
          stripe_subscription_id?: string | null
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'user_subscriptions_user_id_fkey', columns: ['user_id'], referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'user_subscriptions_plan_id_fkey', columns: ['plan_id'], referencedRelation: 'subscription_plans', referencedColumns: ['id'] }
        ]
      }

      bank_statements: {
        Row: {
          id: string
          tenant_id: string
          bank_account_id: string | null
          document_id: string | null
          status: string | null
          start_date?: string | null
          end_date?: string | null
          statement_date?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          closing_balance_type?: string | null
          imported_by?: string | null
          created_at: string | null
          updated_at?: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          bank_account_id?: string | null
          document_id?: string | null
          status?: string | null
          start_date?: string | null
          end_date?: string | null
          statement_date?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          closing_balance_type?: string | null
          imported_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          bank_account_id?: string | null
          document_id?: string | null
          status?: string | null
          start_date?: string | null
          end_date?: string | null
          statement_date?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          closing_balance_type?: string | null
          imported_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [ { foreignKeyName: 'bank_statements_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] } ]
      }

      chart_of_accounts: {
        Row: {
          id: string
          tenant_id: string
          code: string
          name: string
          parent_account_id?: string | null
          type?: string | null
          account_type?: string
          account_subtype?: string | null
          description?: string | null
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          metadata?: Json | null
          currency?: string | null
          is_active?: boolean
        }
        Insert: {
          id?: string
          tenant_id: string
          code: string
          name: string
          type?: string | null
          account_type?: string | null
          account_subtype?: string | null
          description?: string | null
          parent_account_id?: string | null
          is_active?: boolean
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          metadata?: Json | null
          currency?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          code?: string
          name?: string
          type?: string | null
          account_type?: string | null
          account_subtype?: string | null
          description?: string | null
          parent_account_id?: string | null
          is_active?: boolean
          line_items?: Array<{ account_id?: string | null; debit?: number | null; credit?: number | null; description?: string | null }>
          metadata?: Json | null
          currency?: string | null
        }
        Relationships: []
      }

      memberships: {
        Row: { id: string; tenant_id: string; user_id: string; role?: string | null; created_at?: string | null }
        Insert: { id?: string; tenant_id: string; user_id: string; role?: string | null; created_at?: string | null }
        Update: { id?: string; tenant_id?: string; user_id?: string; role?: string | null; created_at?: string | null }
        Relationships: [ { foreignKeyName: 'memberships_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] } ]
      }

      subscription_plans: {
        Row: { id: string; name: string; display_name?: string | null; description?: string | null; price: number; price_monthly?: number | null; price_yearly?: number | null; currency?: string | null; interval?: 'month' | 'year' | null; max_tenants: number; max_documents: number; max_storage_bytes: number; features?: Json | null; yearly_discount_percent?: number | null; is_active?: boolean | null }
        Insert: { id?: string; name: string; display_name?: string | null; description?: string | null; price: number; price_monthly?: number | null; price_yearly?: number | null; currency?: string | null; interval?: 'month' | 'year' | null; max_tenants?: number; max_documents?: number; max_storage_bytes?: number; features?: Json | null; yearly_discount_percent?: number | null; is_active?: boolean | null }
        Update: { id?: string; name?: string; display_name?: string | null; description?: string | null; price?: number; price_monthly?: number | null; price_yearly?: number | null; currency?: string | null; interval?: 'month' | 'year' | null; max_tenants?: number; max_documents?: number; max_storage_bytes?: number; features?: Json | null; yearly_discount_percent?: number | null; is_active?: boolean | null }
        Relationships: []
      }

      promo_codes: {
        Row: {
          id: string
          code: string
          description?: string | null
          is_active: boolean
          discount_type: 'percent' | 'fixed' | 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value: number
          max_uses?: number | null
          current_uses?: number | null
          valid_until?: string | null
          created_at?: string | null
        }
        Insert: {
          id?: string
          code: string
          description?: string | null
          is_active?: boolean
          discount_type?: 'percent' | 'fixed' | 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value?: number
          max_uses?: number | null
          current_uses?: number | null
          valid_until?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          code?: string
          description?: string | null
          is_active?: boolean
          discount_type?: 'percent' | 'fixed' | 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value?: number
          max_uses?: number | null
          current_uses?: number | null
          valid_until?: string | null
          created_at?: string | null
        }
        Relationships: []
      }

      // lightweight view/table placeholders
      admin_user_view: { Row: Record<string, Json>; Insert: Record<string, Json>; Update: Record<string, Json>; Relationships: [] }

      // explicit small tables to tighten common callsites
      ai_providers: {
        Row: {
          id: string
          name: string
          display_name?: string | null
          api_endpoint?: string | null
          is_active?: boolean | null
          per_minute_limit_default?: number | null
          per_hour_limit_default?: number | null
          per_day_limit_default?: number | null
          config?: Json | null
          created_at?: string | null
        }
        Insert: {
          id?: string
          name: string
          display_name?: string | null
          api_endpoint?: string | null
          is_active?: boolean | null
          per_minute_limit_default?: number | null
          per_hour_limit_default?: number | null
          per_day_limit_default?: number | null
          config?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          display_name?: string | null
          api_endpoint?: string | null
          is_active?: boolean | null
          per_minute_limit_default?: number | null
          per_hour_limit_default?: number | null
          per_day_limit_default?: number | null
          config?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }

      members: {
        Row: { id: string; user_id: string | null; email?: string | null; role?: string | null; created_at?: string }
        Insert: { id?: string; user_id?: string | null; email?: string | null; role?: string | null; created_at?: string }
        Update: { id?: string; user_id?: string | null; email?: string | null; role?: string | null; created_at?: string }
        Relationships: []
      }

      exchange_rates: {
        Row: { id: string; tenant_id: string; from_currency: string; to_currency: string; currency?: string | null; rate: number; date: string | null; created_at?: string | null }
        Insert: { id?: string; tenant_id: string; from_currency: string; to_currency: string; currency?: string | null; rate: number; date?: string | null; created_at?: string | null }
        Update: { id?: string; tenant_id?: string; from_currency?: string; to_currency?: string; currency?: string | null; rate?: number; date?: string | null; created_at?: string | null }
        Relationships: []
      }

      tenant_ai_configurations: {
        Row: { id: string; tenant_id: string; ai_providers: { id: string; name: string; config?: Json | null; models?: string[] } | null; model_name?: string | null; created_at?: string | null }
        Insert: { id?: string; tenant_id: string; ai_providers?: { id: string; name: string; config?: Json | null; models?: string[] } | null; model_name?: string | null; created_at?: string | null }
        Update: { id?: string; tenant_id?: string; ai_providers?: { id: string; name: string; config?: Json | null; models?: string[] } | null; model_name?: string | null; created_at?: string | null }
        Relationships: [ { foreignKeyName: 'tenant_ai_configurations_tenant_id_fkey', columns: ['tenant_id'], referencedRelation: 'tenants', referencedColumns: ['id'] } ]
      }

      // catch-all for any other table
      [key: string]: {
        Row: Record<string, Json>
        Insert: Record<string, Json>
        Update: Record<string, Json>
        Relationships: Array<{
          foreignKeyName?: string
          columns?: string[]
          referencedRelation?: string
          referencedColumns?: string[]
        }>
      }
    }

    Views: Record<string, { Row: Record<string, Json>; Insert: Record<string, Json>; Update: Record<string, Json> }>
    Functions: {
      check_ai_rate_limit: { Args: { p_provider_id: string; p_tenant_id?: string | null }; Returns: boolean }
    } & Record<string, { Args: Record<string, any>; Returns: any }>
    Enums: Record<string, string[]>
  }
}

// NOTE: keep this file minimal and stable. Add precise types incrementally.
