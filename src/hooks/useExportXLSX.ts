import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { useToast } from './use-toast';

interface ExportXLSXOptions {
  dashboardName: string;
  dateRange: { start: Date; end: Date };
  data: Record<string, any>[];
  kpis?: Record<string, number>;
}

export function useExportXLSX() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportToXLSX = useCallback(async (options: ExportXLSXOptions) => {
    const { dashboardName, dateRange, data, kpis } = options;
    
    setIsExporting(true);
    
    try {
      // Since we don't have xlsx library, we'll create a multi-sheet CSV format
      // with BOM for Excel compatibility
      
      let content = '\ufeff'; // BOM for UTF-8
      
      // Sheet 1: KPIs
      if (kpis && Object.keys(kpis).length > 0) {
        content += '=== INDICADORES (KPIs) ===\n';
        content += 'Indicador,Valor\n';
        
        Object.entries(kpis).forEach(([key, value]) => {
          if (value !== undefined && value !== null && isFinite(value)) {
            const label = formatLabel(key);
            const formattedValue = formatValue(key, value);
            content += `"${label}","${formattedValue}"\n`;
          }
        });
        
        content += '\n\n';
      }
      
      // Sheet 2: Data
      if (data.length > 0) {
        content += '=== DADOS DETALHADOS ===\n';
        
        const headers = Object.keys(data[0]);
        content += headers.map(h => `"${h}"`).join(',') + '\n';
        
        data.forEach(row => {
          const values = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (val instanceof Date) return format(val, 'yyyy-MM-dd');
            if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          });
          content += values.join(',') + '\n';
        });
        
        content += '\n\n';
      }
      
      // Metadata
      content += '=== METADADOS ===\n';
      content += `Dashboard,"${dashboardName}"\n`;
      content += `Período Início,"${format(dateRange.start, 'yyyy-MM-dd')}"\n`;
      content += `Período Fim,"${format(dateRange.end, 'yyyy-MM-dd')}"\n`;
      content += `Exportado em,"${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}"\n`;
      content += `Total de Linhas,${data.length}\n`;
      
      // Create blob and download
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${dashboardName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
      
      toast({ title: 'Dados exportados com sucesso!' });
    } catch (err) {
      console.error('Export error:', err);
      toast({ title: 'Erro ao exportar dados', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  return { exportToXLSX, isExporting };
}

function formatLabel(key: string): string {
  const labels: Record<string, string> = {
    custo_total: 'Custo Total',
    leads_total: 'Leads Total',
    entrada_total: 'Entradas Total',
    venda_total: 'Vendas Total',
    cpl: 'CPL',
    cac: 'CAC',
    taxa_entrada: 'Taxa de Entrada',
    taxa_venda_total: 'Taxa de Venda',
    taxa_comparecimento: 'Taxa Comparecimento',
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(key: string, value: number): string {
  if (key.includes('custo') || key === 'cpl' || key === 'cac') {
    return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key.includes('taxa_')) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toLocaleString('pt-BR');
}

export default useExportXLSX;
