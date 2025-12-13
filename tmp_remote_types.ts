export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          api_endpoint: string | null
          config: Json | null
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          api_endpoint?: string | null
          config?: Json | null
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          api_endpoint?: string | null
          config?: Json | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          ai_provider_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          model: string | null
          status: string | null
          tenant_id: string | null
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          ai_provider_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          status?: string | null
          tenant_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          ai_provider_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          status?: string | null
          tenant_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_ai_provider_id_fkey"
            columns: ["ai_provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_translations: {
        Row: {
          created_at: string | null
          id: string
          key: string
          locale: string
          namespace: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          locale: string
          namespace?: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          locale?: string
          namespace?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "system_languages"
            referencedColumns: ["code"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string | null
          bank_name: string | null
          created_at: string | null
          currency: string | null
          gl_account_id: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string | null
          bank_name?: string | null
          created_at?: string | null
          currency?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "bank_accounts_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          bank_account_id: string | null
          closing_balance: number | null
          created_at: string | null
          document_id: string | null
          end_date: string | null
          id: string
          opening_balance: number | null
          start_date: string | null
          statement_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          bank_account_id?: string | null
          closing_balance?: number | null
          created_at?: string | null
          document_id?: string | null
          end_date?: string | null
          id?: string
          opening_balance?: number | null
          start_date?: string | null
          statement_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          bank_account_id?: string | null
          closing_balance?: number | null
          created_at?: string | null
          document_id?: string | null
          end_date?: string | null
          id?: string
          opening_balance?: number | null
          start_date?: string | null
          statement_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_statement_id: string | null
          category: string | null
          confidence_score: number | null
          created_at: string | null
          description: string | null
          id: string
          matched_transaction_id: string | null
          metadata: Json | null
          reference_number: string | null
          status: string | null
          tenant_id: string
          transaction_date: string
          transaction_type: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_statement_id?: string | null
          category?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          matched_transaction_id?: string | null
          metadata?: Json | null
          reference_number?: string | null
          status?: string | null
          tenant_id: string
          transaction_date: string
          transaction_type?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_statement_id?: string | null
          category?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          matched_transaction_id?: string | null
          metadata?: Json | null
          reference_number?: string | null
          status?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_statement_id_fkey"
            columns: ["bank_statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_paid: number
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          invoice_pdf: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          stripe_invoice_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          invoice_pdf?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          stripe_invoice_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          invoice_pdf?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          stripe_invoice_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "billing_invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_subtype: string | null
          account_type: string
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_account_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          account_subtype?: string | null
          account_type: string
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_account_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          account_subtype?: string | null
          account_type?: string
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_account_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_data: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          currency: string | null
          document_date: string | null
          document_id: string
          extracted_data: Json
          id: string
          line_items: Json | null
          metadata: Json | null
          total_amount: number | null
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          document_date?: string | null
          document_id: string
          extracted_data?: Json
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          document_date?: string | null
          document_id?: string
          extracted_data?: Json
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_data_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_hash: string | null
          created_at: string | null
          document_type: string | null
          error_message: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          processed_at: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          uploaded_by: string | null
          validation_flags: Json | null
          validation_status: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string | null
          document_type?: string | null
          error_message?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          processed_at?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          uploaded_by?: string | null
          validation_flags?: Json | null
          validation_status?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string | null
          document_type?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          processed_at?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          uploaded_by?: string | null
          validation_flags?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          is_manual: boolean | null
          rate: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency: string
          id?: string
          is_manual?: boolean | null
          rate: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          is_manual?: boolean | null
          rate?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          account_id: string
          created_at: string | null
          credit: number | null
          credit_foreign: number | null
          debit: number | null
          debit_foreign: number | null
          description: string | null
          id: string
          transaction_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit?: number | null
          credit_foreign?: number | null
          debit?: number | null
          debit_foreign?: number | null
          description?: string | null
          id?: string
          transaction_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit?: number | null
          credit_foreign?: number | null
          debit?: number | null
          debit_foreign?: number | null
          description?: string | null
          id?: string
          transaction_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "line_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          role: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "promo_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          configuration: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          report_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          report_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          configuration?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          report_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reports: {
        Row: {
          generated_at: string | null
          generated_by: string | null
          id: string
          period_end: string | null
          period_start: string | null
          report_data: Json
          report_name: string
          report_type: string
          tenant_id: string
        }
        Insert: {
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_data: Json
          report_name: string
          report_type: string
          tenant_id: string
        }
        Update: {
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_data?: Json
          report_name?: string
          report_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_documents: number
          max_storage_bytes: number
          max_tenants: number
          name: string
          price_monthly: number | null
          price_yearly: number | null
          updated_at: string | null
          yearly_discount_percent: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_documents?: number
          max_storage_bytes?: number
          max_tenants?: number
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          updated_at?: string | null
          yearly_discount_percent?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_documents?: number
          max_storage_bytes?: number
          max_tenants?: number
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          updated_at?: string | null
          yearly_discount_percent?: number | null
        }
        Relationships: []
      }
      system_languages: {
        Row: {
          code: string
          created_at: string | null
          flag_emoji: string | null
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          flag_emoji?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          flag_emoji?: string | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_configurations: {
        Row: {
          ai_provider_id: string | null
          api_key_encrypted: string | null
          created_at: string | null
          custom_config: Json | null
          id: string
          is_active: boolean | null
          model_name: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          ai_provider_id?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          custom_config?: Json | null
          id?: string
          is_active?: boolean | null
          model_name?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          ai_provider_id?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          custom_config?: Json | null
          id?: string
          is_active?: boolean | null
          model_name?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_configurations_ai_provider_id_fkey"
            columns: ["ai_provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_ai_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_statistics: {
        Row: {
          document_count: number | null
          id: string
          last_activity: string | null
          storage_used_bytes: number | null
          tenant_id: string
          total_expenses: number | null
          total_revenue: number | null
          transaction_count: number | null
          updated_at: string | null
          user_count: number | null
        }
        Insert: {
          document_count?: number | null
          id?: string
          last_activity?: string | null
          storage_used_bytes?: number | null
          tenant_id: string
          total_expenses?: number | null
          total_revenue?: number | null
          transaction_count?: number | null
          updated_at?: string | null
          user_count?: number | null
        }
        Update: {
          document_count?: number | null
          id?: string
          last_activity?: string | null
          storage_used_bytes?: number | null
          tenant_id?: string
          total_expenses?: number | null
          total_revenue?: number | null
          transaction_count?: number | null
          updated_at?: string | null
          user_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_statistics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          locale: string | null
          name: string
          owner_id: string | null
          slug: string
          subscription_plan: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          locale?: string | null
          name: string
          owner_id?: string | null
          slug: string
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          locale?: string | null
          name?: string
          owner_id?: string | null
          slug?: string
          subscription_plan?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          document_id: string | null
          exchange_rate: number | null
          id: string
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          reference_number: string | null
          status: string | null
          tenant_id: string
          transaction_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          document_id?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          status?: string | null
          tenant_id: string
          transaction_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          document_id?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          status?: string | null
          tenant_id?: string
          transaction_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          next_plan_id: string | null
          next_plan_start_date: string | null
          plan_id: string
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          next_plan_id?: string | null
          next_plan_start_date?: string | null
          plan_id: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          next_plan_id?: string | null
          next_plan_start_date?: string | null
          plan_id?: string
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_next_plan_id_fkey"
            columns: ["next_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          account_subtype: string | null
          account_type: string | null
          balance: number | null
          code: string | null
          name: string | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_view: {
        Row: {
          email: string | null
          full_name: string | null
          membership_active: boolean | null
          role: string | null
          tenant_id: string | null
          tenant_name: string | null
          user_created_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balance: {
        Row: {
          account_type: string | null
          balance: number | null
          code: string | null
          name: string | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_ai_rate_limit: {
        Args: {
          p_limit_day: number
          p_limit_hour: number
          p_limit_min: number
          p_provider_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      create_audit_log: {
        Args: {
          p_action: string
          p_new_data?: Json
          p_old_data?: Json
          p_resource_id?: string
          p_resource_type: string
          p_tenant_id: string
        }
        Returns: string
      }
      get_account_activity: {
        Args: {
          p_account_id: string
          p_end_date?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          reference_number: string
          running_balance: number
          transaction_date: string
          transaction_id: string
        }[]
      }
      get_balance_sheet: {
        Args: { p_as_of_date: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_subtype: string
          account_type: string
          amount: number
        }[]
      }
      get_net_income: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string }
        Returns: number
      }
      get_profit_loss: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_subtype: string
          account_type: string
          amount: number
        }[]
      }
      get_subscription_stats: {
        Args: never
        Returns: {
          active_subscriptions: number
          plan_breakdown: Json
          total_mrr: number
        }[]
      }
      get_system_overview: {
        Args: never
        Returns: {
          active_tenants: number
          storage_used_gb: number
          total_documents: number
          total_tenants: number
          total_transactions: number
          total_users: number
        }[]
      }
      get_system_trends: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          date: string
          new_documents: number
          new_tenants: number
          new_transactions: number
          new_users: number
        }[]
      }
      get_tenant_currency: { Args: { p_tenant_id: string }; Returns: string }
      get_tenant_details: {
        Args: { p_tenant_id: string }
        Returns: {
          created_at: string
          document_count: number
          last_activity: string
          locale: string
          net_income: number
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          total_expenses: number
          total_revenue: number
          transaction_count: number
          user_count: number
        }[]
      }
      get_trial_balance: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_subtype: string
          account_type: string
          balance: number
          credit_amount: number
          debit_amount: number
        }[]
      }
      get_user_subscription_details: {
        Args: { p_user_id: string }
        Returns: {
          current_documents: number
          current_period_end: string
          current_period_start: string
          current_storage_bytes: number
          current_tenants: number
          features: Json
          max_documents: number
          max_storage_bytes: number
          max_tenants: number
          plan_name: string
          price_monthly: number
          status: string
        }[]
      }
      get_user_tenant_ids: {
        Args: never
        Returns: {
          tenant_id: string
        }[]
      }
      is_super_admin: { Args: never; Returns: boolean }
      refresh_account_balances: { Args: never; Returns: undefined }
      seed_chart_of_accounts: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      update_tenant_statistics: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      user_can_access_tenant_documents: {
        Args: { tenant_id: string }
        Returns: boolean
      }
      user_has_role: { Args: { required_roles: string[] }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
