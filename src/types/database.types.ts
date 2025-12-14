export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          locale: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          locale?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          locale?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      memberships: {
        Row: {
          id: string
          user_id: string
          tenant_id: string
          role: 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'SUPER_ADMIN'
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tenant_id: string
          role: 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'SUPER_ADMIN'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tenant_id?: string
          role?: 'COMPANY_ADMIN' | 'ACCOUNTANT' | 'OPERATOR' | 'SUPER_ADMIN'
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          tenant_id: string
          file_path: string
          file_name: string
          file_size: number
          file_type: string
          status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type: string | null
          uploaded_by: string | null
          processed_at: string | null
          error_message: string | null
          content_hash: string | null
          validation_status: string | null
          validation_flags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          file_path: string
          file_name: string
          file_size: number
          file_type: string
          status?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type?: string | null
          uploaded_by?: string | null
          processed_at?: string | null
          error_message?: string | null
          content_hash?: string | null
          validation_status?: string | null
          validation_flags?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          file_path?: string
          file_name?: string
          file_size?: number
          file_type?: string
          status?: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
          document_type?: string | null
          uploaded_by?: string | null
          processed_at?: string | null
          error_message?: string | null
          content_hash?: string | null
          validation_status?: string | null
          validation_flags?: string[] | null
          created_at?: string
          updated_at?: string
        }
      }
      document_data: {
        Row: {
          id: string
          document_id: string
          extracted_data: Json
          confidence_score: number | null
          vendor_name: string | null
          document_date: string | null
          total_amount: number | null
          currency: string
          line_items: Json
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_id: string
          extracted_data?: Json
          confidence_score?: number | null
          vendor_name?: string | null
          document_date?: string | null
          total_amount?: number | null
          currency?: string
          line_items?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          extracted_data?: Json
          confidence_score?: number | null
          vendor_name?: string | null
          document_date?: string | null
          total_amount?: number | null
          currency?: string
          line_items?: Json
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      ai_providers: {
        Row: {
          id: string
          name: string
          display_name: string
          api_endpoint: string | null
          is_active: boolean
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          display_name: string
          api_endpoint?: string | null
          is_active?: boolean
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_name?: string
          api_endpoint?: string | null
          is_active?: boolean
          config?: Json
          created_at?: string
          updated_at?: string
        }
      }
      tenant_ai_configurations: {
        Row: {
          id: string
          tenant_id: string
          ai_provider_id: string | null
          api_key_encrypted: string | null
          model_name: string | null
          custom_config: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ai_provider_id?: string | null
          api_key_encrypted?: string | null
          model_name?: string | null
          custom_config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ai_provider_id?: string | null
          api_key_encrypted?: string | null
          model_name?: string | null
          custom_config?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      chart_of_accounts: {
        Row: {
          id: string
          tenant_id: string
          code: string
          name: string
          account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
          account_subtype: string | null
          parent_account_id: string | null
          is_active: boolean
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          code: string
          name: string
          account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
          account_subtype?: string | null
          parent_account_id?: string | null
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          code?: string
          name?: string
          account_type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
          account_subtype?: string | null
          parent_account_id?: string | null
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      transactions: {
        Row: {
          id: string
          tenant_id: string
          transaction_date: string
          description: string | null
          reference_number: string | null
          status: 'DRAFT' | 'POSTED' | 'VOID'
          document_id: string | null
          created_by: string | null
          posted_by: string | null
          posted_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          transaction_date: string
          description?: string | null
          reference_number?: string | null
          status?: 'DRAFT' | 'POSTED' | 'VOID'
          document_id?: string | null
          created_by?: string | null
          posted_by?: string | null
          posted_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          transaction_date?: string
          description?: string | null
          reference_number?: string | null
          status?: 'DRAFT' | 'POSTED' | 'VOID'
          document_id?: string | null
          created_by?: string | null
          posted_by?: string | null
          posted_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      line_items: {
        Row: {
          id: string
          transaction_id: string
          account_id: string
          debit: number
          credit: number
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          account_id: string
          debit?: number
          credit?: number
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          account_id?: string
          debit?: number
          credit?: number
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bank_accounts: {
        Row: {
          id: string
          tenant_id: string
          account_name: string
          account_number: string | null
          currency: string
          bank_name: string | null
          gl_account_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          account_name: string
          account_number?: string | null
          currency?: string
          bank_name?: string | null
          gl_account_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          account_name?: string
          account_number?: string | null
          currency?: string
          bank_name?: string | null
          gl_account_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bank_statements: {
        Row: {
          id: string
          tenant_id: string
          bank_account_id: string | null
          document_id: string | null
          statement_date: string | null
          start_date: string | null
          end_date: string | null
          opening_balance: number | null
          closing_balance: number | null
          status: 'IMPORTED' | 'PROCESSED' | 'RECONCILED'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bank_account_id?: string | null
          document_id?: string | null
          statement_date?: string | null
          start_date?: string | null
          end_date?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          status?: 'IMPORTED' | 'PROCESSED' | 'RECONCILED'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bank_account_id?: string | null
          document_id?: string | null
          statement_date?: string | null
          start_date?: string | null
          end_date?: string | null
          opening_balance?: number | null
          closing_balance?: number | null
          status?: 'IMPORTED' | 'PROCESSED' | 'RECONCILED'
          created_at?: string
          updated_at?: string
        }
      }
      bank_transactions: {
        Row: {
          id: string
          tenant_id: string
          bank_statement_id: string | null
          transaction_date: string
          description: string | null
          amount: number
          transaction_type: 'DEBIT' | 'CREDIT' | null
          reference_number: string | null
          category: string | null
          status: 'PENDING' | 'MATCHED' | 'EXCLUDED'
          matched_transaction_id: string | null
          confidence_score: number | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          bank_statement_id?: string | null
          transaction_date: string
          description?: string | null
          amount: number
          transaction_type?: 'DEBIT' | 'CREDIT' | null
          reference_number?: string | null
          category?: string | null
          status?: 'PENDING' | 'MATCHED' | 'EXCLUDED'
          matched_transaction_id?: string | null
          confidence_score?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          bank_statement_id?: string | null
          transaction_date?: string
          description?: string | null
          amount?: number
          transaction_type?: 'DEBIT' | 'CREDIT' | null
          reference_number?: string | null
          category?: string | null
          status?: 'PENDING' | 'MATCHED' | 'EXCLUDED'
          matched_transaction_id?: string | null
          confidence_score?: number | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      },
      exchange_rates: {
        Row: {
          id: string
          tenant_id: string
          currency: string
          rate: number
          is_manual: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          currency: string
          rate: number
          is_manual?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          currency?: string
          rate?: number
          is_manual?: boolean
          created_at?: string
          updated_at?: string
        }
      },
      audit_logs: {
        Row: {
          id: string
          tenant_id: string | null
          user_id: string | null
          action: string
          resource_type: string
          resource_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action: string
          resource_type: string
          resource_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string | null
          user_id?: string | null
          action?: string
          resource_type?: string
          resource_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      },
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          description: string | null
          is_public: boolean | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: Json
          description?: string | null
          is_public?: boolean | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          description?: string | null
          is_public?: boolean | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
      },
      tenant_statistics: {
        Row: {
          id: string
          tenant_id: string
          user_count: number | null
          document_count: number | null
          transaction_count: number | null
          total_revenue: number | null
          total_expenses: number | null
          last_activity: string | null
          storage_used_bytes: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_count?: number | null
          document_count?: number | null
          transaction_count?: number | null
          total_revenue?: number | null
          total_expenses?: number | null
          last_activity?: string | null
          storage_used_bytes?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_count?: number | null
          document_count?: number | null
          transaction_count?: number | null
          total_revenue?: number | null
          total_expenses?: number | null
          last_activity?: string | null
          storage_used_bytes?: number | null
          updated_at?: string
        }
      },
      subscription_plans: {
        Row: {
          id: string
          name: string
          description: string | null
          max_tenants: number
          max_documents: number
          max_storage_bytes: number
          features: Json
          price_monthly: number | null
          price_yearly: number | null
          yearly_discount_percent: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          max_tenants?: number
          max_documents?: number
          max_storage_bytes?: number
          features?: Json
          price_monthly?: number | null
          price_yearly?: number | null
          yearly_discount_percent?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          max_tenants?: number
          max_documents?: number
          max_storage_bytes?: number
          features?: Json
          price_monthly?: number | null
          price_yearly?: number | null
          yearly_discount_percent?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
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
      }
      promo_codes: {
        Row: {
          id: string
          code: string
          description: string | null
          discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value: number
          max_uses: number | null
          current_uses: number
          valid_from: string | null
          valid_until: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          description?: string | null
          discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value: number
          max_uses?: number | null
          current_uses?: number
          valid_from?: string | null
          valid_until?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          description?: string | null
          discount_type?: 'PERCENTAGE' | 'FIXED_AMOUNT'
          discount_value?: number
          max_uses?: number | null
          current_uses?: number
          valid_from?: string | null
          valid_until?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string
          status: 'active' | 'canceled' | 'past_due' | 'trial' | null
          current_period_start: string | null
          current_period_end: string | null
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
          created_at?: string
          updated_at?: string
        }
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
          created_at?: string
        }
      }
      ai_usage_logs: {
        Row: {
          id: string
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
          ai_provider_id?: string | null
          model?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          status?: string | null
          error_message?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_subscription_details: {
        Args: {
          p_user_id: string
        }
        Returns: Array<{
          plan_name: string
          max_tenants: number
          current_tenants: number
          max_documents: number
          max_storage_bytes: number
          price_monthly: number
          status: string
          current_period_end: string
        }>
      }
      user_can_access_tenant_documents: {
        Args: {
          tenant_id: string
        }
        Returns: boolean
      }
      seed_chart_of_accounts: {
        Args: {
          p_tenant_id: string
        }
        Returns: void
      }
      get_trial_balance: {
        Args: {
          p_tenant_id: string
          p_start_date?: string
          p_end_date?: string
        }
        Returns: Array<{
          account_id: string
          account_code: string
          account_name: string
          account_type: string
          account_subtype: string
          debit_amount: number
          credit_amount: number
          balance: number
        }>
      }
      get_profit_loss: {
        Args: {
          p_tenant_id: string
          p_start_date: string
          p_end_date: string
        }
        Returns: Array<{
          account_id: string
          account_code: string
          account_name: string
          account_type: string
          account_subtype: string
          amount: number
        }>
      }
      get_balance_sheet: {
        Args: {
          p_tenant_id: string
          p_as_of_date: string
        }
        Returns: Array<{
          account_id: string
          account_code: string
          account_name: string
          account_type: string
          account_subtype: string
          amount: number
        }>
      }
      get_net_income: {
        Args: {
          p_tenant_id: string
          p_start_date: string
          p_end_date: string
        }
        Returns: number
      }
      get_account_activity: {
        Args: {
          p_tenant_id: string
          p_account_id: string
          p_start_date?: string
          p_end_date?: string
        }
        Returns: Array<{
          transaction_id: string
          transaction_date: string
          description: string
          reference_number: string
          debit: number
          credit: number
          running_balance: number
        }>
      }
      refresh_account_balances: {
        Args: Record<string, never>
        Returns: void
      }
      create_audit_log: {
        Args: {
          p_tenant_id: string
          p_action: string
          p_resource_type: string
          p_resource_id?: string
          p_old_data?: any
          p_new_data?: any
        }
        Returns: string
      }
      update_tenant_statistics: {
        Args: {
          p_tenant_id: string
        }
        Returns: void
      }
      get_system_overview: {
        Args: Record<string, never>
        Returns: Array<{
          total_tenants: number
          active_tenants: number
          total_users: number
          total_documents: number
          total_transactions: number
          storage_used_gb: number
        }>
      }
      get_tenant_details: {
        Args: {
          p_tenant_id: string
        }
        Returns: Array<{
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          locale: string
          created_at: string
          user_count: number
          document_count: number
          transaction_count: number
          total_revenue: number
          total_expenses: number
          net_income: number
          last_activity: string
        }>
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
