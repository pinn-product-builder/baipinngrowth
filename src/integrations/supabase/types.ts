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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_auto_insights: {
        Row: {
          alerts: Json | null
          created_at: string
          dashboard_id: string
          date: string
          forecast: Json | null
          highlights: Json | null
          id: string
          meta: Json | null
          summary: string
          tenant_id: string
        }
        Insert: {
          alerts?: Json | null
          created_at?: string
          dashboard_id: string
          date: string
          forecast?: Json | null
          highlights?: Json | null
          id?: string
          meta?: Json | null
          summary: string
          tenant_id: string
        }
        Update: {
          alerts?: Json | null
          created_at?: string
          dashboard_id?: string
          date?: string
          forecast?: Json | null
          highlights?: Json | null
          id?: string
          meta?: Json | null
          summary?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_auto_insights_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_auto_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          dashboard_id: string | null
          end_date: string | null
          id: string
          start_date: string | null
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dashboard_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dashboard_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          meta: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: {
          created_at: string
          date: string
          estimated_cost: number | null
          id: string
          requests: number | null
          tenant_id: string
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          estimated_cost?: number | null
          id?: string
          requests?: number | null
          tenant_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          estimated_cost?: number | null
          id?: string
          requests?: number | null
          tenant_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          completion_tokens: number | null
          cost_estimated: number | null
          created_at: string
          dashboard_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_tokens: number | null
          request_type: string
          status: string
          tenant_id: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number | null
          cost_estimated?: number | null
          created_at?: string
          dashboard_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          request_type?: string
          status?: string
          tenant_id: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number | null
          cost_estimated?: number | null
          created_at?: string
          dashboard_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          request_type?: string
          status?: string
          tenant_id?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
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
      alert_configurations: {
        Row: {
          alert_type: string
          created_at: string | null
          emails: string[] | null
          enabled: boolean | null
          id: string
          is_global: boolean | null
          notification_channels: Json | null
          tenant_id: string | null
          threshold_unit: string | null
          threshold_value: number | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          emails?: string[] | null
          enabled?: boolean | null
          id?: string
          is_global?: boolean | null
          notification_channels?: Json | null
          tenant_id?: string | null
          threshold_unit?: string | null
          threshold_value?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          emails?: string[] | null
          enabled?: boolean | null
          id?: string
          is_global?: boolean | null
          notification_channels?: Json | null
          tenant_id?: string | null
          threshold_unit?: string | null
          threshold_value?: number | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_history: {
        Row: {
          alert_config_id: string | null
          alert_type: string
          created_at: string | null
          goal_id: string | null
          id: string
          message: string
          metric_value: number | null
          notification_channels: string[] | null
          notification_error: string | null
          notification_sent: boolean | null
          severity: string
          tenant_id: string
          threshold_value: number | null
          title: string
        }
        Insert: {
          alert_config_id?: string | null
          alert_type: string
          created_at?: string | null
          goal_id?: string | null
          id?: string
          message: string
          metric_value?: number | null
          notification_channels?: string[] | null
          notification_error?: string | null
          notification_sent?: boolean | null
          severity?: string
          tenant_id: string
          threshold_value?: number | null
          title: string
        }
        Update: {
          alert_config_id?: string | null
          alert_type?: string
          created_at?: string | null
          goal_id?: string | null
          id?: string
          message?: string
          metric_value?: number | null
          notification_channels?: string[] | null
          notification_error?: string | null
          notification_sent?: boolean | null
          severity?: string
          tenant_id?: string
          threshold_value?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_config_id_fkey"
            columns: ["alert_config_id"]
            isOneToOne: false
            referencedRelation: "alert_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_history_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "tenant_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_categories: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_context_cache: {
        Row: {
          cache_hash: string
          created_at: string
          dashboard_id: string
          end_date: string
          expires_at: string
          id: string
          payload: Json
          start_date: string
          tenant_id: string
        }
        Insert: {
          cache_hash: string
          created_at?: string
          dashboard_id: string
          end_date: string
          expires_at: string
          id?: string
          payload: Json
          start_date: string
          tenant_id: string
        }
        Update: {
          cache_hash?: string
          created_at?: string
          dashboard_id?: string
          end_date?: string
          expires_at?: string
          id?: string
          payload?: Json
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_context_cache_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_context_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_definitions: {
        Row: {
          created_at: string
          dashboard_id: string
          dataset_ids: string[] | null
          default_view_tab: string | null
          filters_json: Json | null
          id: string
          template_id: string
          tiles_json: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_id: string
          dataset_ids?: string[] | null
          default_view_tab?: string | null
          filters_json?: Json | null
          id?: string
          template_id?: string
          tiles_json?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_id?: string
          dataset_ids?: string[] | null
          default_view_tab?: string | null
          filters_json?: Json | null
          id?: string
          template_id?: string
          tiles_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_definitions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: true
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_generated_insights: {
        Row: {
          change_percent: number | null
          comparison_period_end: string | null
          comparison_period_start: string | null
          comparison_value: number | null
          created_at: string | null
          current_value: number | null
          dashboard_id: string
          description: string
          details: Json | null
          dismissed_at: string | null
          id: string
          impact_estimate: string | null
          insight_type: string
          metric_key: string | null
          period_end: string | null
          period_start: string | null
          priority: string
          suggested_action: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          change_percent?: number | null
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          comparison_value?: number | null
          created_at?: string | null
          current_value?: number | null
          dashboard_id: string
          description: string
          details?: Json | null
          dismissed_at?: string | null
          id?: string
          impact_estimate?: string | null
          insight_type: string
          metric_key?: string | null
          period_end?: string | null
          period_start?: string | null
          priority?: string
          suggested_action?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          change_percent?: number | null
          comparison_period_end?: string | null
          comparison_period_start?: string | null
          comparison_value?: number | null
          created_at?: string | null
          current_value?: number | null
          dashboard_id?: string
          description?: string
          details?: Json | null
          dismissed_at?: string | null
          id?: string
          impact_estimate?: string | null
          insight_type?: string
          metric_key?: string | null
          period_end?: string | null
          period_start?: string | null
          priority?: string
          suggested_action?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_generated_insights_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_generated_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_insights: {
        Row: {
          content: string
          created_at: string
          dashboard_id: string
          id: string
          period_end: string | null
          period_start: string | null
          tags: string[] | null
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          dashboard_id: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          tags?: string[] | null
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          dashboard_id?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          tags?: string[] | null
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_insights_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_permissions: {
        Row: {
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          dashboard_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          dashboard_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          dashboard_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_permissions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_spec_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          dashboard_id: string
          dashboard_layout: Json | null
          dashboard_spec: Json | null
          id: string
          notes: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          dashboard_id: string
          dashboard_layout?: Json | null
          dashboard_spec?: Json | null
          id?: string
          notes?: string | null
          version: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          dashboard_id?: string
          dashboard_layout?: Json | null
          dashboard_spec?: Json | null
          id?: string
          notes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_spec_versions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          allowed_domains: string[] | null
          cache_ttl_seconds: number | null
          category_id: string | null
          created_at: string
          dashboard_layout: Json | null
          dashboard_spec: Json | null
          data_source_id: string | null
          default_filters: Json | null
          description: string | null
          detected_columns: Json | null
          display_order: number
          display_type: Database["public"]["Enums"]["dashboard_type"]
          id: string
          is_active: boolean
          last_error_message: string | null
          last_fetched_at: string | null
          last_health_check_at: string | null
          last_health_status: string | null
          name: string
          source_kind: Database["public"]["Enums"]["dashboard_source_kind"]
          tags: string[] | null
          template_kind:
            | Database["public"]["Enums"]["dashboard_template_kind"]
            | null
          tenant_id: string
          updated_at: string
          use_proxy: boolean | null
          view_name: string | null
          webhook_url: string | null
        }
        Insert: {
          allowed_domains?: string[] | null
          cache_ttl_seconds?: number | null
          category_id?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          dashboard_spec?: Json | null
          data_source_id?: string | null
          default_filters?: Json | null
          description?: string | null
          detected_columns?: Json | null
          display_order?: number
          display_type?: Database["public"]["Enums"]["dashboard_type"]
          id?: string
          is_active?: boolean
          last_error_message?: string | null
          last_fetched_at?: string | null
          last_health_check_at?: string | null
          last_health_status?: string | null
          name: string
          source_kind?: Database["public"]["Enums"]["dashboard_source_kind"]
          tags?: string[] | null
          template_kind?:
            | Database["public"]["Enums"]["dashboard_template_kind"]
            | null
          tenant_id: string
          updated_at?: string
          use_proxy?: boolean | null
          view_name?: string | null
          webhook_url?: string | null
        }
        Update: {
          allowed_domains?: string[] | null
          cache_ttl_seconds?: number | null
          category_id?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          dashboard_spec?: Json | null
          data_source_id?: string | null
          default_filters?: Json | null
          description?: string | null
          detected_columns?: Json | null
          display_order?: number
          display_type?: Database["public"]["Enums"]["dashboard_type"]
          id?: string
          is_active?: boolean
          last_error_message?: string | null
          last_fetched_at?: string | null
          last_health_check_at?: string | null
          last_health_status?: string | null
          name?: string
          source_kind?: Database["public"]["Enums"]["dashboard_source_kind"]
          tags?: string[] | null
          template_kind?:
            | Database["public"]["Enums"]["dashboard_template_kind"]
            | null
          tenant_id?: string
          updated_at?: string
          use_proxy?: boolean | null
          view_name?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dashboard_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "tenant_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "tenant_data_sources_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_issues: {
        Row: {
          affected_columns: string[] | null
          affected_dates: string[] | null
          created_at: string | null
          dashboard_id: string | null
          dataset_id: string | null
          description: string | null
          details: Json | null
          id: string
          issue_type: string
          resolved_at: string | null
          severity: string
          tenant_id: string
          title: string
        }
        Insert: {
          affected_columns?: string[] | null
          affected_dates?: string[] | null
          created_at?: string | null
          dashboard_id?: string | null
          dataset_id?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          issue_type: string
          resolved_at?: string | null
          severity?: string
          tenant_id: string
          title: string
        }
        Update: {
          affected_columns?: string[] | null
          affected_dates?: string[] | null
          created_at?: string | null
          dashboard_id?: string | null
          dataset_id?: string | null
          description?: string | null
          details?: Json | null
          id?: string
          issue_type?: string
          resolved_at?: string | null
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_column_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          dataset_id: string
          id: string
          mapping_json: Json
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dataset_id: string
          id?: string
          mapping_json?: Json
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dataset_id?: string
          id?: string
          mapping_json?: Json
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dataset_column_mappings_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_column_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_columns: {
        Row: {
          aggregator_default: string | null
          column_name: string
          created_at: string
          dataset_id: string
          db_type: string
          display_label: string | null
          format: string | null
          id: string
          is_hidden: boolean | null
          is_nullable: boolean | null
          role_hint: string | null
          semantic_type: string | null
          sort_priority: number | null
          updated_at: string
        }
        Insert: {
          aggregator_default?: string | null
          column_name: string
          created_at?: string
          dataset_id: string
          db_type: string
          display_label?: string | null
          format?: string | null
          id?: string
          is_hidden?: boolean | null
          is_nullable?: boolean | null
          role_hint?: string | null
          semantic_type?: string | null
          sort_priority?: number | null
          updated_at?: string
        }
        Update: {
          aggregator_default?: string | null
          column_name?: string
          created_at?: string
          dataset_id?: string
          db_type?: string
          display_label?: string | null
          format?: string | null
          id?: string
          is_hidden?: boolean | null
          is_nullable?: boolean | null
          role_hint?: string | null
          semantic_type?: string | null
          sort_priority?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_columns_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_relationships: {
        Row: {
          cardinality: string | null
          created_at: string
          enabled: boolean
          id: string
          join_type: string
          left_dataset_id: string
          left_key: string
          right_dataset_id: string
          right_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cardinality?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          join_type?: string
          left_dataset_id: string
          left_key: string
          right_dataset_id: string
          right_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cardinality?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          join_type?: string
          left_dataset_id?: string
          left_key?: string
          right_dataset_id?: string
          right_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_relationships_left_dataset_id_fkey"
            columns: ["left_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_relationships_right_dataset_id_fkey"
            columns: ["right_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_relationships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          created_at: string
          datasource_id: string
          default_order: string | null
          grain_hint: string | null
          id: string
          is_active: boolean
          kind: string
          last_introspected_at: string | null
          name: string
          object_name: string | null
          primary_key: string | null
          primary_time_column: string | null
          refresh_policy: string | null
          row_limit_default: number | null
          schema_name: string
          sql_query: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          datasource_id: string
          default_order?: string | null
          grain_hint?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          last_introspected_at?: string | null
          name: string
          object_name?: string | null
          primary_key?: string | null
          primary_time_column?: string | null
          refresh_policy?: string | null
          row_limit_default?: number | null
          schema_name?: string
          sql_query?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          datasource_id?: string
          default_order?: string | null
          grain_hint?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          last_introspected_at?: string | null
          name?: string
          object_name?: string | null
          primary_key?: string | null
          primary_time_column?: string | null
          refresh_policy?: string | null
          row_limit_default?: number | null
          schema_name?: string
          sql_query?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "datasets_datasource_id_fkey"
            columns: ["datasource_id"]
            isOneToOne: false
            referencedRelation: "tenant_data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datasets_datasource_id_fkey"
            columns: ["datasource_id"]
            isOneToOne: false
            referencedRelation: "tenant_data_sources_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datasets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      events_v2: {
        Row: {
          actor: string | null
          agent_id: string | null
          channel: string
          created_at: string
          dedupe_key: string
          event_ts: string
          event_type: string
          id: string
          lead_id: string | null
          org_id: string
          payload: Json | null
        }
        Insert: {
          actor?: string | null
          agent_id?: string | null
          channel: string
          created_at?: string
          dedupe_key: string
          event_ts?: string
          event_type: string
          id?: string
          lead_id?: string | null
          org_id: string
          payload?: Json | null
        }
        Update: {
          actor?: string | null
          agent_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          event_ts?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          org_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          config: Json | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          is_global: boolean | null
          name: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          is_global?: boolean | null
          name: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          is_global?: boolean | null
          name?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_keys_v2: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          key_hash: string
          name: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_hash: string
          name?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_hash?: string
          name?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_keys_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_v2: {
        Row: {
          created_at: string
          email: string | null
          id: string
          kommo_contact_id: string | null
          kommo_lead_id: string | null
          name: string | null
          org_id: string
          phone_e164: string | null
          phone_raw: string | null
          updated_at: string
          utm_ad: string | null
          utm_adset: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          kommo_contact_id?: string | null
          kommo_lead_id?: string | null
          name?: string | null
          org_id: string
          phone_e164?: string | null
          phone_raw?: string | null
          updated_at?: string
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          kommo_contact_id?: string | null
          kommo_lead_id?: string | null
          name?: string | null
          org_id?: string
          phone_e164?: string | null
          phone_raw?: string | null
          updated_at?: string
          utm_ad?: string | null
          utm_adset?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_daily_limit_messages: number | null
          ai_daily_limit_tokens: number | null
          ai_enabled: boolean | null
          ai_response_mode: string | null
          ai_style: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          password_changed: boolean
          status: string
          tenant_id: string | null
          theme: string | null
          updated_at: string
        }
        Insert: {
          ai_daily_limit_messages?: number | null
          ai_daily_limit_tokens?: number | null
          ai_enabled?: boolean | null
          ai_response_mode?: string | null
          ai_style?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          password_changed?: boolean
          status?: string
          tenant_id?: string | null
          theme?: string | null
          updated_at?: string
        }
        Update: {
          ai_daily_limit_messages?: number | null
          ai_daily_limit_tokens?: number | null
          ai_enabled?: boolean | null
          ai_response_mode?: string | null
          ai_style?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_changed?: boolean
          status?: string
          tenant_id?: string | null
          theme?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string | null
          created_by: string | null
          dashboard_ids: string[]
          emails: string[]
          frequency: string
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          dashboard_ids: string[]
          emails: string[]
          frequency: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name: string
          next_send_at?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          dashboard_ids?: string[]
          emails?: string[]
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_events: {
        Row: {
          created_at: string
          details: Json | null
          error_code: string | null
          event_type: string
          id: string
          message: string
          resolved_at: string | null
          source: string
          source_id: string | null
          source_name: string | null
          tenant_id: string | null
          trace_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          error_code?: string | null
          event_type: string
          id?: string
          message: string
          resolved_at?: string | null
          source: string
          source_id?: string | null
          source_name?: string | null
          tenant_id?: string | null
          trace_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          error_code?: string | null
          event_type?: string
          id?: string
          message?: string
          resolved_at?: string | null
          source?: string
          source_id?: string | null
          source_name?: string | null
          tenant_id?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_health_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_settings: {
        Row: {
          api_key_encrypted: string | null
          api_key_last4: string | null
          created_at: string
          default_model: string | null
          enabled: boolean | null
          id: string
          max_requests_per_minute: number | null
          max_spend_month_usd: number | null
          max_tokens_per_day: number | null
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          created_at?: string
          default_model?: string | null
          enabled?: boolean | null
          id?: string
          max_requests_per_minute?: number | null
          max_spend_month_usd?: number | null
          max_tokens_per_day?: number | null
          provider?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          created_at?: string
          default_model?: string | null
          enabled?: boolean | null
          id?: string
          max_requests_per_minute?: number | null
          max_spend_month_usd?: number | null
          max_tokens_per_day?: number | null
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          created_at: string | null
          custom_css: string | null
          custom_domain: string | null
          display_name: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_css?: string | null
          custom_domain?: string | null
          display_name?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_css?: string | null
          custom_domain?: string | null
          display_name?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_data_sources: {
        Row: {
          allowed_views: string[]
          anon_key_encrypted: string | null
          anon_key_present: boolean
          auth_mode: string | null
          base_url: string | null
          bearer_token: string | null
          created_at: string
          google_access_token_encrypted: string | null
          google_client_id_encrypted: string | null
          google_client_secret_encrypted: string | null
          google_email: string | null
          google_refresh_token_encrypted: string | null
          google_sheet_name: string | null
          google_spreadsheet_id: string | null
          google_token_expires_at: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          name: string
          project_ref: string
          project_url: string
          service_role_key_encrypted: string | null
          service_role_key_present: boolean
          sync_mode: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          allowed_views?: string[]
          anon_key_encrypted?: string | null
          anon_key_present?: boolean
          auth_mode?: string | null
          base_url?: string | null
          bearer_token?: string | null
          created_at?: string
          google_access_token_encrypted?: string | null
          google_client_id_encrypted?: string | null
          google_client_secret_encrypted?: string | null
          google_email?: string | null
          google_refresh_token_encrypted?: string | null
          google_sheet_name?: string | null
          google_spreadsheet_id?: string | null
          google_token_expires_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          name: string
          project_ref: string
          project_url: string
          service_role_key_encrypted?: string | null
          service_role_key_present?: boolean
          sync_mode?: string | null
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          allowed_views?: string[]
          anon_key_encrypted?: string | null
          anon_key_present?: boolean
          auth_mode?: string | null
          base_url?: string | null
          bearer_token?: string | null
          created_at?: string
          google_access_token_encrypted?: string | null
          google_client_id_encrypted?: string | null
          google_client_secret_encrypted?: string | null
          google_email?: string | null
          google_refresh_token_encrypted?: string | null
          google_sheet_name?: string | null
          google_spreadsheet_id?: string | null
          google_token_expires_at?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          name?: string
          project_ref?: string
          project_url?: string
          service_role_key_encrypted?: string | null
          service_role_key_present?: boolean
          sync_mode?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_data_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_goals: {
        Row: {
          alert_enabled: boolean | null
          alert_threshold_critical: number | null
          alert_threshold_warning: number | null
          created_at: string | null
          dashboard_id: string | null
          goal_type: string
          goal_value: number
          goal_value_max: number | null
          id: string
          is_active: boolean | null
          metric_key: string
          metric_label: string
          tenant_id: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          alert_enabled?: boolean | null
          alert_threshold_critical?: number | null
          alert_threshold_warning?: number | null
          created_at?: string | null
          dashboard_id?: string | null
          goal_type?: string
          goal_value: number
          goal_value_max?: number | null
          id?: string
          is_active?: boolean | null
          metric_key: string
          metric_label: string
          tenant_id: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_enabled?: boolean | null
          alert_threshold_critical?: number | null
          alert_threshold_warning?: number | null
          created_at?: string | null
          dashboard_id?: string | null
          goal_type?: string
          goal_value?: number
          goal_value_max?: number | null
          id?: string
          is_active?: boolean | null
          metric_key?: string
          metric_label?: string
          tenant_id?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_goals_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          domain_allowlist: string[] | null
          id: string
          is_active: boolean
          max_dashboards: number | null
          max_schedules: number | null
          max_users: number | null
          name: string
          rate_limit_per_minute: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_allowlist?: string[] | null
          id?: string
          is_active?: boolean
          max_dashboards?: number | null
          max_schedules?: number | null
          max_users?: number | null
          name: string
          rate_limit_per_minute?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_allowlist?: string[] | null
          id?: string
          is_active?: boolean
          max_dashboards?: number | null
          max_schedules?: number | null
          max_users?: number | null
          name?: string
          rate_limit_per_minute?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          token: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          token: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vapi_calls: {
        Row: {
          avg_duration_seconds: number | null
          call_date: string
          calls_answered: number | null
          calls_missed: number | null
          calls_total: number
          created_at: string
          id: string
          org_id: string
          total_duration_seconds: number | null
          updated_at: string
        }
        Insert: {
          avg_duration_seconds?: number | null
          call_date: string
          calls_answered?: number | null
          calls_missed?: number | null
          calls_total?: number
          created_at?: string
          id?: string
          org_id: string
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Update: {
          avg_duration_seconds?: number | null
          call_date?: string
          calls_answered?: number | null
          calls_missed?: number | null
          calls_total?: number
          created_at?: string
          id?: string
          org_id?: string
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      tenant_data_sources_safe: {
        Row: {
          allowed_views: string[] | null
          anon_key_present: boolean | null
          auth_mode: string | null
          base_url: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          project_ref: string | null
          project_url: string | null
          service_role_key_present: boolean | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_views?: string[] | null
          anon_key_present?: boolean | null
          auth_mode?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          project_ref?: string | null
          project_url?: string | null
          service_role_key_present?: boolean | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_views?: string[] | null
          anon_key_present?: boolean | null
          auth_mode?: string | null
          base_url?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          project_ref?: string | null
          project_url?: string | null
          service_role_key_present?: boolean | null
          tenant_id?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_data_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_agente_kpis_30d: {
        Row: {
          dias_ativos: number | null
          eventos_total: number | null
          leads_tocados: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_agente_kpis_7d: {
        Row: {
          dias_ativos: number | null
          eventos_total: number | null
          leads_tocados: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dashboard_daily_60d_v3: {
        Row: {
          day: string | null
          ligacoes: number | null
          ligacoes_atendidas: number | null
          ligacoes_perdidas: number | null
          minutos: number | null
          org_id: string | null
        }
        Insert: {
          day?: string | null
          ligacoes?: number | null
          ligacoes_atendidas?: number | null
          ligacoes_perdidas?: number | null
          minutos?: never
          org_id?: string | null
        }
        Update: {
          day?: string | null
          ligacoes?: number | null
          ligacoes_atendidas?: number | null
          ligacoes_perdidas?: number | null
          minutos?: never
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dashboard_kpis_30d_v3: {
        Row: {
          dias_ativos: number | null
          leads_total: number | null
          ligacoes_media_dia: number | null
          ligacoes_total: number | null
          mensagens_recebidas: number | null
          minutos_totais: number | null
          org_id: string | null
          reunioes_marcadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dashboard_kpis_7d_v3: {
        Row: {
          dias_ativos: number | null
          leads_total: number | null
          ligacoes_media_dia: number | null
          ligacoes_total: number | null
          mensagens_recebidas: number | null
          minutos_totais: number | null
          org_id: string | null
          reunioes_marcadas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_funnel_current_exec_v4: {
        Row: {
          leads: number | null
          org_id: string | null
          stage_key: string | null
          stage_name: string | null
          stage_order: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_funnel_daily_30d_v3: {
        Row: {
          day: string | null
          leads: number | null
          org_id: string | null
          stage_key: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_kommo_msg_in_by_hour_7d_v3: {
        Row: {
          hour: number | null
          msg_in_total: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_kommo_msg_in_daily_60d_v3: {
        Row: {
          day: string | null
          msg_in_total: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_kommo_msg_in_heatmap_30d_v3: {
        Row: {
          dow: number | null
          hour: number | null
          msg_in_total: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_meetings_daily_60d_v3: {
        Row: {
          day: string | null
          meetings_booked: number | null
          meetings_completed: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_meetings_kpis_30d_v3: {
        Row: {
          meetings_booked: number | null
          meetings_cancelled: number | null
          meetings_completed: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_meetings_kpis_7d_v3: {
        Row: {
          meetings_booked: number | null
          meetings_cancelled: number | null
          meetings_completed: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_meetings_upcoming_v3: {
        Row: {
          lead_email: string | null
          lead_name: string | null
          lead_phone: string | null
          meeting_url: string | null
          org_id: string | null
          start_at: string | null
          status: string | null
          summary: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_v2_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vapi_calls_by_assistant_daily_v3: {
        Row: {
          assistant_id: string | null
          assistant_name: string | null
          avg_duration_seconds: number | null
          calls_answered: number | null
          calls_missed: number | null
          calls_total: number | null
          day: string | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vapi_calls_daily_v3: {
        Row: {
          avg_duration_seconds: number | null
          calls_answered: number | null
          calls_missed: number | null
          calls_total: number | null
          day: string | null
          org_id: string | null
          total_duration_seconds: number | null
        }
        Insert: {
          avg_duration_seconds?: number | null
          calls_answered?: number | null
          calls_missed?: number | null
          calls_total?: number | null
          day?: string | null
          org_id?: string | null
          total_duration_seconds?: number | null
        }
        Update: {
          avg_duration_seconds?: number | null
          calls_answered?: number | null
          calls_missed?: number | null
          calls_total?: number | null
          day?: string | null
          org_id?: string | null
          total_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vapi_calls_hourly_v3: {
        Row: {
          calls_total: number | null
          hour: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_vapi_calls_meetings_daily_v3: {
        Row: {
          day: string | null
          meetings_from_calls: number | null
          org_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client" | "manager" | "viewer"
      dashboard_source_kind: "webhook" | "supabase_view"
      dashboard_template_kind: "none" | "costs_funnel_daily" | "custom"
      dashboard_type: "auto" | "iframe" | "html" | "json"
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
    Enums: {
      app_role: ["admin", "client", "manager", "viewer"],
      dashboard_source_kind: ["webhook", "supabase_view"],
      dashboard_template_kind: ["none", "costs_funnel_daily", "custom"],
      dashboard_type: ["auto", "iframe", "html", "json"],
    },
  },
} as const
