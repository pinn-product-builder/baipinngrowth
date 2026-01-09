import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Algo deu errado</CardTitle>
          <CardDescription>
            Ocorreu um erro inesperado. Por favor, tente novamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {import.meta.env.DEV && error && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs font-mono text-destructive break-all">
                {error.message}
              </p>
              {error.stack && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer text-muted-foreground">
                    Stack trace
                  </summary>
                  <pre className="text-xs mt-2 overflow-auto max-h-40">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onReset} className="flex-1">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboards')} className="flex-1">
              <Home className="mr-2 h-4 w-4" />
              Voltar ao início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ErrorBoundary(props: Props) {
  return <ErrorBoundaryClass {...props} />;
}

