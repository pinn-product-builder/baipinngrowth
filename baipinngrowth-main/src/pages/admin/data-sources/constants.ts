/**
 * Constantes para Data Sources
 */

export const DATA_SOURCE_TYPES = {
  PROXY_WEBHOOK: 'proxy_webhook',
  GOOGLE_SHEETS: 'google_sheets',
  SUPABASE: 'supabase',
} as const;

export const AUTH_MODES = {
  NONE: 'none',
  BEARER_TOKEN: 'bearer_token',
} as const;

export const SYNC_MODES = {
  DIRECT_QUERY: 'direct_query',
  ETL_TO_SUPABASE: 'etl_to_supabase',
} as const;

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

export const GOOGLE_OAUTH_REDIRECT_PATH = '/oauth/callback';

