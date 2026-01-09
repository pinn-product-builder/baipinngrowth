import { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Copy, Table as TableIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  children: ReactNode;
  fallbackData?: any[];
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  showCompatibilityMode: boolean;
}

// Wrapper to use hooks in class component
function CopyDiagnosticButton({ diagnostic }: { diagnostic: string }) {
  const { toast } = useToast();
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(diagnostic);
      toast({ title: 'Diagnóstico copiado' });
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };
  
  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Copy className="mr-2 h-4 w-4" />
      Copiar diagnóstico
    </Button>
  );
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: '',
      showCompatibilityMode: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('DashboardErrorBoundary caught error:', error, errorInfo);
    
    this.setState({
      errorInfo: `${error.name}: ${error.message}\n\nComponent Stack:\n${errorInfo.componentStack || 'N/A'}`,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: '', showCompatibilityMode: false });
    this.props.onRetry?.();
  };

  handleShowCompatibilityMode = () => {
    this.setState({ showCompatibilityMode: true });
  };

  getDiagnostic(): string {
    const { error, errorInfo } = this.state;
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      error: error?.message || 'Unknown',
      stack: error?.stack?.split('\n').slice(0, 10) || [],
      componentStack: errorInfo?.split('\n').slice(0, 10) || [],
      url: window.location.href,
      userAgent: navigator.userAgent,
    }, null, 2);
  }

  render() {
    const { hasError, error, showCompatibilityMode } = this.state;
    const { children, fallbackData } = this.props;

    if (!hasError) {
      return children;
    }

    // Compatibility mode - show simple table
    if (showCompatibilityMode && fallbackData && fallbackData.length > 0) {
      return (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TableIcon className="h-4 w-4 text-warning" />
              Modo Compatibilidade
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Exibindo dados em formato simplificado devido a um erro.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {Object.keys(fallbackData[0]).slice(0, 10).map(key => (
                      <th key={key} className="px-3 py-2 text-left font-medium">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fallbackData.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b">
                      {Object.entries(row).slice(0, 10).map(([key, value]) => (
                        <td key={key} className="px-3 py-2 tabular-nums">
                          {typeof value === 'number' 
                            ? value.toLocaleString('pt-BR')
                            : String(value ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <CopyDiagnosticButton diagnostic={this.getDiagnostic()} />
            </div>
          </CardContent>
        </Card>
      );
    }

    // Error state
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-warning/10 p-4 mb-4">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          <h3 className="text-lg font-medium mb-1">Erro ao renderizar dashboard</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-2">
            {error?.message || 'Ocorreu um erro inesperado.'}
          </p>
          <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded mb-4 max-w-lg font-mono">
            {error?.name || 'Error'}
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            <Button variant="outline" onClick={this.handleRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </Button>
            {fallbackData && fallbackData.length > 0 && (
              <Button variant="secondary" onClick={this.handleShowCompatibilityMode}>
                <TableIcon className="mr-2 h-4 w-4" />
                Modo compatibilidade
              </Button>
            )}
            <CopyDiagnosticButton diagnostic={this.getDiagnostic()} />
          </div>
        </CardContent>
      </Card>
    );
  }
}

export default DashboardErrorBoundary;
