import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DataTableViewProps {
  data: any[];
  spec: Record<string, any>;
  onExport?: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

const formatPercent = (value: number) => {
  return `${((value || 0) * 100).toFixed(1)}%`;
};

const formatInteger = (value: number) => {
  return (value || 0).toLocaleString('pt-BR');
};

const COLUMN_LABELS: Record<string, string> = {
  dia: 'Dia',
  custo_total: 'Custo Total',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  reuniao_agendada_total: 'Reu. Agendadas',
  reuniao_realizada_total: 'Reu. Realizadas',
  venda_total: 'Vendas',
  falta_total: 'Faltas',
  desmarque_total: 'Desmarques',
  cpl: 'CPL',
  cac: 'CAC',
  custo_por_entrada: 'Custo/Entrada',
  custo_por_reuniao_agendada: 'Custo/Reu.Ag.',
  custo_por_reuniao_realizada: 'Custo/Reu.Real.',
  taxa_entrada: 'Taxa Entrada',
  taxa_reuniao_agendada: 'Taxa Agend.',
  taxa_comparecimento: 'Taxa Compar.',
  taxa_venda_pos_reuniao: 'Taxa Venda (Reu)',
  taxa_venda_total: 'Taxa Venda Total',
};

export default function DataTableView({ data, spec, onExport }: DataTableViewProps) {
  const formatting = spec?.formatting || {};
  
  // Determine columns to show
  const columns = useMemo(() => {
    if (spec?.tableColumns && spec.tableColumns.length > 0) {
      return spec.tableColumns;
    }
    if (data.length > 0) {
      return Object.keys(data[0]).filter(k => !['id', 'created_at', 'updated_at'].includes(k));
    }
    return [];
  }, [data, spec]);

  const formatValue = (col: string, value: any) => {
    if (value === null || value === undefined) return '-';
    
    // Date column
    if (col === 'dia' || col === 'date' || col === 'data') {
      try {
        return format(parseISO(value), 'dd/MM/yyyy', { locale: ptBR });
      } catch {
        return value;
      }
    }
    
    const fmt = formatting[col];
    
    if (fmt === 'currency' || col.includes('custo') || col === 'cpl' || col === 'cac') {
      return formatCurrency(value);
    }
    
    if (fmt === 'percent' || col.startsWith('taxa_')) {
      return formatPercent(value);
    }
    
    if (fmt === 'integer' || col.endsWith('_total')) {
      return formatInteger(value);
    }
    
    if (typeof value === 'number') {
      return value.toLocaleString('pt-BR');
    }
    
    return String(value);
  };

  const exportCSV = () => {
    if (data.length === 0) return;
    
    const headers = columns;
    const csvContent = [
      headers.map(h => COLUMN_LABELS[h] || h).join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dados_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    link.click();
    
    onExport?.();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Dados Completos</CardTitle>
        <Button onClick={exportCSV} variant="outline" size="sm" disabled={data.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col: string) => (
                  <TableHead 
                    key={col} 
                    className={col !== 'dia' ? 'text-right' : ''}
                  >
                    {COLUMN_LABELS[col] || col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={row.dia || idx}>
                  {columns.map((col: string) => (
                    <TableCell 
                      key={col}
                      className={col !== 'dia' ? 'text-right' : ''}
                    >
                      {formatValue(col, row[col])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
