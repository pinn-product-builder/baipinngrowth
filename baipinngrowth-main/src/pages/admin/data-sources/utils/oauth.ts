/**
 * Utilitários para OAuth do Google
 */

import { GOOGLE_OAUTH_REDIRECT_PATH } from '../constants';

/**
 * Obtém a URL de redirect para OAuth do Google
 */
export function getGoogleOAuthRedirectUri(): string {
  const origin = window.location.origin;
  return `${origin}${GOOGLE_OAUTH_REDIRECT_PATH}`;
}

/**
 * Gera um state token para OAuth
 */
export function generateOAuthState(data: Record<string, any>): string {
  return btoa(JSON.stringify({
    ...data,
    timestamp: Date.now()
  }));
}

/**
 * Decodifica o state token do OAuth
 */
export function decodeOAuthState(state: string): Record<string, any> | null {
  try {
    return JSON.parse(atob(state));
  } catch {
    return null;
  }
}

