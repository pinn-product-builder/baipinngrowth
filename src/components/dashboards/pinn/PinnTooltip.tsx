// ============================================================
// PINN TOOLTIP - Premium chart tooltip component
// ============================================================

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface PinnTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatValue?: (value: number, dataKey: string) => string;
}

export function PinnTooltip({ 
  active, 
  payload, 
  label,
  formatValue,
}: PinnTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  
  const formatDateLabel = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), "dd 'de' MMMM", { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  const defaultFormatValue = (value: number, dataKey: string): string => {
    if (dataKey.includes('taxa') || dataKey.includes('percent')) {
      return `${value.toFixed(1)}%`;
    }
    if (dataKey.includes('investimento') || dataKey.includes('custo') || dataKey.includes('cpl') || dataKey.includes('cac')) {
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    return value.toLocaleString('pt-BR');
  };
  
  return (
    <div className="bg-pinn-bg-elevated/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-pinn-xl p-4 min-w-[200px]">
      <p className="text-sm font-semibold text-white mb-3 pb-2 border-b border-white/10">
        {formatDateLabel(label || '')}
      </p>
      <div className="space-y-2.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-full ring-2 ring-white/20" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-white/60">{entry.name}</span>
            </div>
            <span className="font-semibold text-white tabular-nums">
              {typeof entry.value === 'number' 
                ? (formatValue || defaultFormatValue)(entry.value, entry.dataKey)
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simpler tooltip for single-metric charts
export function PinnSimpleTooltip({ 
  active, 
  payload, 
  label,
  suffix = '',
  prefix = '',
}: PinnTooltipProps & { suffix?: string; prefix?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  
  const formatDateLabel = (dateValue: string) => {
    try {
      return format(parseISO(dateValue), "dd/MM", { locale: ptBR });
    } catch {
      return dateValue;
    }
  };
  
  const value = payload[0]?.value;
  
  return (
    <div className="bg-pinn-bg-elevated/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-pinn-lg px-3 py-2">
      <p className="text-xs text-white/50 mb-1">{formatDateLabel(label || '')}</p>
      <p className="text-sm font-semibold text-white tabular-nums">
        {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR') : '—'}{suffix}
      </p>
    </div>
  );
}
