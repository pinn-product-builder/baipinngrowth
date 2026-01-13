// ============================================================
// AFONSINA KPI CARDS - Cards de KPIs usando dados v3
// ============================================================

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, DollarSign, Users, Target, BarChart3, UserCheck, Calendar } from 'lucide-react';
import type { KPIs } from '@/hooks/useAfonsinaDashboardData';

interface AfonsinaKPICardsProps {
  kpis: KPIs;
  previousKpis?: KPIs;
  comparisonEnabled?: boolean;
  className?: string;
}

// Format currency in pt-BR
function formatCurrency(value: number | null): string {
  if (value === null || !isFinite(value)) return '—';
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format number in pt-BR
function formatNumber(value: number | null): string {
  if (value === null || !isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

// Format percentage
function formatPercent(value: number | null): string {
  if (value === null || !isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

// Calculate variation between current and previous
function calculateVariation(current: number | null, previous: number | null): {
  value: number | null;
  direction: 'up' | 'down' | 'neutral';
  isGood: boolean;
  inverse?: boolean;
} {
  if (current === null || previous === null || previous === 0) {
    return { value: null, direction: 'neutral', isGood: false };
  }
  
  const variation = ((current - previous) / previous) * 100;
  const direction = variation > 1 ? 'up' : variation < -1 ? 'down' : 'neutral';
  
  return { value: variation, direction, isGood: false };
}

// Variation badge component
function VariationBadge({ 
  current, 
  previous, 
  inverse = false,
  className 
}: { 
  current: number | null; 
  previous: number | null; 
  inverse?: boolean;
  className?: string;
}) {
  const { value, direction } = calculateVariation(current, previous);
  
  if (value === null) return null;
  
  // For costs (CPL, CAC), down is good. For volume (leads, vendas), up is good.
  const isGood = inverse ? direction === 'down' : direction === 'up';
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs gap-1",
        isGood ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30",
        direction === 'neutral' && "text-muted-foreground border-muted",
        className
      )}
    >
      {direction === 'up' && <TrendingUp className="h-3 w-3" />}
      {direction === 'down' && <TrendingDown className="h-3 w-3" />}
      {direction === 'neutral' && <Minus className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </Badge>
  );
}

// Individual KPI card
function KPICard({
  label,
  value,
  previousValue,
  format,
  icon: Icon,
  comparisonEnabled,
  inverse = false,
  className,
}: {
  label: string;
  value: number | null;
  previousValue?: number | null;
  format: 'currency' | 'number' | 'percent';
  icon: React.ElementType;
  comparisonEnabled?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  const formattedValue = format === 'currency' 
    ? formatCurrency(value) 
    : format === 'percent' 
    ? formatPercent(value)
    : formatNumber(value);
  
  const hasValue = value !== null && isFinite(value) && value > 0;
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      !hasValue && "opacity-60",
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {comparisonEnabled && previousValue !== undefined && (
            <VariationBadge 
              current={value} 
              previous={previousValue} 
              inverse={inverse}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{formattedValue}</p>
        {comparisonEnabled && previousValue !== undefined && previousValue !== null && (
          <p className="text-xs text-muted-foreground mt-1">
            Anterior: {format === 'currency' ? formatCurrency(previousValue) : formatNumber(previousValue)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AfonsinaKPICards({
  kpis,
  previousKpis,
  comparisonEnabled = false,
  className,
}: AfonsinaKPICardsProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Row 1: Main volume KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Investimento"
          value={kpis.investimento_total}
          previousValue={previousKpis?.investimento_total}
          format="currency"
          icon={DollarSign}
          comparisonEnabled={comparisonEnabled}
        />
        <KPICard
          label="Leads"
          value={kpis.leads_total}
          previousValue={previousKpis?.leads_total}
          format="number"
          icon={Users}
          comparisonEnabled={comparisonEnabled}
        />
        <KPICard
          label="Entradas"
          value={kpis.entradas_total}
          previousValue={previousKpis?.entradas_total}
          format="number"
          icon={UserCheck}
          comparisonEnabled={comparisonEnabled}
        />
        <KPICard
          label="Reuniões Agendadas"
          value={kpis.reunioes_agendadas}
          previousValue={previousKpis?.reunioes_agendadas}
          format="number"
          icon={Calendar}
          comparisonEnabled={comparisonEnabled}
        />
      </div>
      
      {/* Row 2: Cost efficiency KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <KPICard
          label="CPL (Custo por Lead)"
          value={kpis.cpl}
          previousValue={previousKpis?.cpl}
          format="currency"
          icon={BarChart3}
          comparisonEnabled={comparisonEnabled}
          inverse
        />
        <KPICard
          label="Custo por Entrada"
          value={kpis.custo_por_entrada}
          previousValue={previousKpis?.custo_por_entrada}
          format="currency"
          icon={BarChart3}
          comparisonEnabled={comparisonEnabled}
          inverse
        />
      </div>
      
      {/* Row 3: Conversion rates */}
      <div className="grid grid-cols-2 gap-4">
        <KPICard
          label="Taxa de Entrada"
          value={kpis.taxa_entrada}
          previousValue={previousKpis?.taxa_entrada}
          format="percent"
          icon={TrendingUp}
          comparisonEnabled={comparisonEnabled}
        />
        <KPICard
          label="Taxa Reunião Agendada"
          value={kpis.taxa_reuniao_agendada}
          previousValue={previousKpis?.taxa_reuniao_agendada}
          format="percent"
          icon={TrendingUp}
          comparisonEnabled={comparisonEnabled}
        />
      </div>
    </div>
  );
}
