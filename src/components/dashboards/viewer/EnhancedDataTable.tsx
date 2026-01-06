import { useMemo, useState, useCallback, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Download, Search, Columns, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnhancedDataTableProps {
  data: any[];
  spec?: Record<string, any>;
  onRowClick?: (row: any, index: number) => void;
  className?: string;
}

const COLUMN_LABELS: Record<string, string> = {
  dia: 'Data',
  custo_total: 'Custo Total',
  leads_total: 'Leads',
  entrada_total: 'Entradas',
  reuniao_agendada_total: 'Reuniões Agend.',
  reuniao_realizada_total: 'Reuniões Real.',
  venda_total: 'Vendas',
  falta_total: 'Faltas',
  desmarque_total: 'Desmarques',
  cpl: 'CPL',
  cac: 'CAC',
  custo_por_entrada: 'Custo/Entrada',
  custo_por_reuniao_agendada: 'Custo/R. Agend.',
  custo_por_reuniao_realizada: 'Custo/R. Real.',
  taxa_entrada: 'Taxa Entrada',
  taxa_reuniao_agendada: 'Taxa Agendamento',
  taxa_comparecimento: 'Taxa Comparec.',
  taxa_venda_pos_reuniao: 'Taxa Venda/Reunião',
  taxa_venda_total: 'Taxa Conversão',
};

const PAGE_SIZES = [10, 25, 50, 100];

const formatValue = (value: any, key: string): string => {
  if (value === null || value === undefined) return '-';
  
  // Handle Date objects directly
  if (value instanceof Date) {
    try {
      return format(value, 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return value.toLocaleDateString('pt-BR');
    }
  }
  
  // Date string columns
  if (key === 'dia' || key === 'date' || key === 'created_at') {
    try {
      return format(parseISO(value), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return String(value);
    }
  }
  
  // Currency
  if (key.includes('custo') || key === 'cpl' || key === 'cac') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }
  
  // Percentage
  if (key.includes('taxa_')) {
    return `${((value || 0) * 100).toFixed(1)}%`;
  }
  
  // Number
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR');
  }
  
  // Objects/Arrays - convert to string safely
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
};

export default function EnhancedDataTable({
  data,
  spec = {},
  onRowClick,
  className,
}: EnhancedDataTableProps) {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  });

  const allColumns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  // Update visible columns when data changes
  useMemo(() => {
    if (visibleColumns.length === 0 && allColumns.length > 0) {
      setVisibleColumns(allColumns);
    }
  }, [allColumns]);

  // Filter data
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    
    const searchLower = search.toLowerCase();
    return data.filter(row => 
      Object.values(row).some(value => 
        String(value).toLowerCase().includes(searchLower)
      )
    );
  }, [data, search]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Paginate
  const paginatedData = useMemo(() => {
    const start = page * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => 
      prev.includes(column) 
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  // Export CSV
  const exportCSV = useCallback(() => {
    const headers = visibleColumns.map(col => COLUMN_LABELS[col] || col);
    const rows = sortedData.map(row => 
      visibleColumns.map(col => {
        const val = row[col];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      }).join(',')
    );
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dados_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [sortedData, visibleColumns]);

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum dado disponível
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <CardTitle className="text-base">Dados Detalhados</CardTitle>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-8 h-9 w-[180px]"
              />
            </div>
            
            {/* Column selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Columns className="mr-2 h-4 w-4" />
                  Colunas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                {allColumns.map(col => (
                  <DropdownMenuCheckboxItem
                    key={col}
                    checked={visibleColumns.includes(col)}
                    onCheckedChange={() => toggleColumn(col)}
                  >
                    {COLUMN_LABELS[col] || col}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Export */}
            <Button variant="outline" size="sm" onClick={exportCSV} className="h-9">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {visibleColumns.map(col => (
                <TableHead 
                  key={col}
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {COLUMN_LABELS[col] || col}
                    {sortColumn === col && (
                      sortDirection === 'asc' 
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((row, i) => (
              <TableRow 
                key={i}
                className={cn(
                  onRowClick && "cursor-pointer hover:bg-muted/50"
                )}
                onClick={() => onRowClick?.(row, page * pageSize + i)}
              >
                {visibleColumns.map(col => (
                  <TableCell key={col} className="tabular-nums whitespace-nowrap">
                    {formatValue(row[col], col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
        <div className="text-sm text-muted-foreground">
          {sortedData.length} registro{sortedData.length !== 1 ? 's' : ''}
          {search && ` (filtrado de ${data.length})`}
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size}/página</option>
            ))}
          </select>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              {page + 1} / {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
