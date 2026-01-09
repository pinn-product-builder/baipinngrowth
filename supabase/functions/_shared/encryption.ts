// ============================================================
// SHARED ENCRYPTION MODULE
// Unified encryption/decryption for all edge functions
// ============================================================

/**
 * Encryption format types:
 * - GOOGLE_FORMAT: Base64-encoded master key (for Google Sheets tokens)
 * - SUPABASE_FORMAT: Raw text padded to 32 chars (for Supabase data source keys)
 */
export type EncryptionFormat = 'google' | 'supabase';

// =====================================================
// ENCRYPTION KEY DERIVATION
// =====================================================

/**
 * Get encryption key for Google Sheets format (Base64 encoded master key)
 */
export async function getEncryptionKeyGoogleFormat(): Promise<CryptoKey> {
  const keyB64 = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!keyB64) throw new Error('MASTER_ENCRYPTION_KEY not configured');
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Get encryption key for Supabase datasource format (raw text padded)
 */
export async function getEncryptionKeySupabaseFormat(): Promise<CryptoKey> {
  const masterKey = Deno.env.get('MASTER_ENCRYPTION_KEY');
  if (!masterKey) throw new Error('MASTER_ENCRYPTION_KEY not configured');
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt', 'encrypt']
  );
}

// =====================================================
// DECRYPTION
// =====================================================

/**
 * Decrypt a value encrypted with Google Sheets format
 */
export async function decryptGoogleFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeyGoogleFormat();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt a value encrypted with Supabase datasource format
 */
export async function decryptSupabaseFormat(ciphertext: string): Promise<string> {
  const key = await getEncryptionKeySupabaseFormat();
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

/**
 * Unified decrypt function - automatically detects format or uses specified format
 */
export async function decrypt(ciphertext: string, format: EncryptionFormat = 'supabase'): Promise<string> {
  if (format === 'google') {
    return decryptGoogleFormat(ciphertext);
  }
  return decryptSupabaseFormat(ciphertext);
}

// =====================================================
// ENCRYPTION
// =====================================================

/**
 * Encrypt a value with Google Sheets format
 */
export async function encryptGoogleFormat(plaintext: string): Promise<string> {
  const key = await getEncryptionKeyGoogleFormat();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Encrypt a value with Supabase datasource format
 */
export async function encryptSupabaseFormat(plaintext: string): Promise<string> {
  const key = await getEncryptionKeySupabaseFormat();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Unified encrypt function
 */
export async function encrypt(plaintext: string, format: EncryptionFormat = 'supabase'): Promise<string> {
  if (format === 'google') {
    return encryptGoogleFormat(plaintext);
  }
  return encryptSupabaseFormat(plaintext);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Check if master encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
  return !!Deno.env.get('MASTER_ENCRYPTION_KEY');
}

/**
 * Get the encryption format based on data source type
 */
export function getFormatForDataSourceType(type: string): EncryptionFormat {
  if (type === 'google_sheets' || type === 'google-sheets') {
    return 'google';
  }
  return 'supabase';
}
