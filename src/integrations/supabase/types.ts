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
      dashboards: {
        Row: {
          cache_ttl_seconds: number | null
          category_id: string | null
          created_at: string
          data_source_id: string | null
          default_filters: Json | null
          description: string | null
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
          tenant_id: string
          updated_at: string
          use_proxy: boolean | null
          view_name: string | null
          webhook_url: string | null
        }
        Insert: {
          cache_ttl_seconds?: number | null
          category_id?: string | null
          created_at?: string
          data_source_id?: string | null
          default_filters?: Json | null
          description?: string | null
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
          tenant_id: string
          updated_at?: string
          use_proxy?: boolean | null
          view_name?: string | null
          webhook_url?: string | null
        }
        Update: {
          cache_ttl_seconds?: number | null
          category_id?: string | null
          created_at?: string
          data_source_id?: string | null
          default_filters?: Json | null
          description?: string | null
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
            foreignKeyName: "dashboards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          password_changed: boolean
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          password_changed?: boolean
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_changed?: boolean
          status?: string
          tenant_id?: string | null
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
      tenant_data_sources: {
        Row: {
          allowed_views: string[]
          anon_key_encrypted: string | null
          anon_key_present: boolean
          created_at: string
          id: string
          is_active: boolean
          name: string
          project_ref: string
          project_url: string
          service_role_key_encrypted: string | null
          service_role_key_present: boolean
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          allowed_views?: string[]
          anon_key_encrypted?: string | null
          anon_key_present?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          project_ref: string
          project_url: string
          service_role_key_encrypted?: string | null
          service_role_key_present?: boolean
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          allowed_views?: string[]
          anon_key_encrypted?: string | null
          anon_key_present?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          project_ref?: string
          project_url?: string
          service_role_key_encrypted?: string | null
          service_role_key_present?: boolean
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
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
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
    }
    Views: {
      [_ in never]: never
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
      dashboard_type: ["auto", "iframe", "html", "json"],
    },
  },
} as const
