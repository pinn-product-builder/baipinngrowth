/**
 * Tipos compartilhados para Data Sources
 */

export interface Tenant {
  id: string;
  name: string;
}

export interface DataSource {
  id: string;
  tenant_id: string;
  type: string;
  name: string;
  project_ref: string;
  project_url: string;
  base_url: string | null;
  auth_mode: string | null;
  bearer_token: string | null;
  anon_key_present: boolean;
  service_role_key_present: boolean;
  allowed_views: string[];
  is_active: boolean;
  created_at: string;
  tenants?: { name: string } | null;
}

export interface ViewInfo {
  name: string;
  schema: string;
  type: 'view' | 'table';
}

export type TestStatus = 'idle' | 'testing' | 'success' | 'error';
export type DataSourceType = 'supabase' | 'proxy_webhook' | 'google_sheets';

export interface GoogleSpreadsheet {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface GoogleSheet {
  sheetId: number;
  title: string;
  index: number;
  rowCount?: number;
  columnCount?: number;
}

export interface ProxyFormData {
  name: string;
  tenantId: string;
  baseUrl: string;
  authMode: 'none' | 'bearer_token';
  bearerToken: string;
  allowedViews: string[];
}

export interface SupabaseFormData {
  name: string;
  tenantId: string;
  projectRef: string;
  projectUrl: string;
  allowedViews: string[];
}

export interface GoogleSheetsFormData {
  name: string;
  tenantId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  selectedSheets: string[];
  syncMode: 'direct_query' | 'etl_to_supabase';
  googleClientId: string;
  googleClientSecret: string;
}

export interface KeyFormData {
  anonKey: string;
  serviceRoleKey: string;
}

export type GoogleOAuthStep = 'connect' | 'select_spreadsheet' | 'select_sheets' | 'done';

