/**
 * Aggregation Preview Component
 * Shows preview of KPIs and funnel aggregation
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export interface AggregationPreviewData {
  kpis: { key: string; label: string; value: number; format: string }[];
  funnel: { column: string; label: string; value: number; rate?: number }[];
  computed: boolean;
  source: 'sample' | 'full_aggregate';
}

interface AggregationPreviewProps {
  data: AggregationPreviewData | null;
  isLoading?: boolean;
}

export default function AggregationPreview({ data, isLoading }: AggregationPreviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview de Agregação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preview de Agregação</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Preview de Agregação</CardTitle>
          <Badge variant={data.source === 'full_aggregate' ? 'default' : 'secondary'}>
            {data.source === 'full_aggregate' ? 'Agregação Completa' : 'Amostra'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs */}
        <div>
          <h4 className="text-sm font-medium mb-3">KPIs</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.kpis.map((kpi) => (
              <div key={kpi.key} className="p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-lg font-semibold">
                  {kpi.format === 'currency' 
                    ? `R$ ${kpi.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : kpi.format === 'percent'
                    ? `${(kpi.value * 100).toFixed(1)}%`
                    : kpi.value.toLocaleString('pt-BR')
                  }
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel */}
        {data.funnel.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Funil</h4>
            <div className="space-y-2">
              {data.funnel.map((stage, index) => (
                <div key={stage.column} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{index + 1}</span>
                    <span className="text-sm">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{stage.value.toLocaleString('pt-BR')}</span>
                    {stage.rate !== undefined && (
                      <Badge variant="outline">
                        {((stage.rate || 0) * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


