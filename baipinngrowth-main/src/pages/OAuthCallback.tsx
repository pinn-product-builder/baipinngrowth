import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * OAuth Callback Handler
 * 
 * This is the FIXED OAuth callback endpoint that Google redirects to after authentication.
 * The redirect_uri registered in Google Cloud Console MUST be:
 * 
 *   https://<your-domain>/oauth/callback
 * 
 * This page:
 * 1. Receives the OAuth code from Google
 * 2. Sends it to the parent window (popup flow) or stores it for redirect flow
 * 3. Closes itself or redirects back to data sources
 */
export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    // Debug logging (only in development)
    if (import.meta.env.DEV) {
      console.log('[OAuth Callback] Received callback');
      console.log('[OAuth Callback] code:', code ? 'present' : 'missing');
      console.log('[OAuth Callback] error:', error);
      console.log('[OAuth Callback] state:', state);
      console.log('[OAuth Callback] Full URL:', window.location.href);
    }

    if (error) {
      setStatus('error');
      setErrorMessage(error === 'access_denied' 
        ? 'Acesso negado. Você cancelou a autorização.' 
        : `Erro OAuth: ${error}`
      );
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMessage('Código de autorização não encontrado na URL.');
      return;
    }

    // If we're in a popup, notify the parent window and close
    if (window.opener) {
      try {
        // Send the code and state back to the parent window
        window.opener.postMessage({
          type: 'GOOGLE_OAUTH_CALLBACK',
          code,
          state
        }, window.location.origin);
        
        setStatus('success');
        
        // Close the popup after a brief moment
        setTimeout(() => {
          window.close();
        }, 1500);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('[OAuth Callback] Error sending to parent:', e);
        }
        setStatus('error');
        setErrorMessage('Erro ao comunicar com a janela principal.');
      }
    } else {
      // Not in a popup - redirect flow
      // Store the code and redirect to data sources
      try {
        sessionStorage.setItem('oauth_callback_code', code);
        if (state) {
          sessionStorage.setItem('oauth_callback_state', state);
        }
        setStatus('success');
        
        // Redirect to data sources page
        setTimeout(() => {
          navigate('/admin/data-sources', { replace: true });
        }, 1000);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('[OAuth Callback] Error storing code:', e);
        }
        setStatus('error');
        setErrorMessage('Erro ao processar o código OAuth.');
      }
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'processing' && (
              <LoadingSpinner className="h-12 w-12" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
            {status === 'error' && (
              <XCircle className="h-12 w-12 text-destructive" />
            )}
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {status === 'processing' && 'Processando...'}
            {status === 'success' && 'Conectado!'}
            {status === 'error' && 'Erro na Conexão'}
          </CardTitle>
          <CardDescription>
            {status === 'processing' && 'Aguarde enquanto processamos sua autenticação...'}
            {status === 'success' && 'Autenticação concluída com sucesso. Esta janela será fechada automaticamente.'}
            {status === 'error' && errorMessage}
          </CardDescription>
        </CardHeader>
        {status === 'error' && (
          <CardContent className="flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => window.opener ? window.close() : navigate('/admin/data-sources')}
            >
              {window.opener ? 'Fechar' : 'Voltar'}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
