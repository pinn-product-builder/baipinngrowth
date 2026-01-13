// ============================================================
// PINN DATA TABLE - Premium data table component
// ============================================================

import { cn } from '@/lib/utils';
import { PinnGlassCard, PinnGlassCardHeader, PinnGlassCardContent } from './PinnGlassCard';
import { ExternalLink } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface PinnDataTableProps<T> {
  title?: string;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  className?: string;
  emptyMessage?: string;
  maxRows?: number;
}

export function PinnDataTable<T extends Record<string, unknown>>({
  title,
  subtitle,
  columns,
  data,
  className,
  emptyMessage = "Nenhum dado disponível",
  maxRows,
}: PinnDataTableProps<T>) {
  const displayData = maxRows ? data.slice(0, maxRows) : data;

  return (
    <PinnGlassCard className={className} hover={false}>
      {title && (
        <PinnGlassCardHeader>
          <h3 className="text-base font-semibold text-white tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>
          )}
        </PinnGlassCardHeader>
      )}
      <PinnGlassCardContent className={cn(!title && "pt-5")}>
        {displayData.length === 0 ? (
          <div className="py-8 text-center text-white/40 text-sm">
            {emptyMessage}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      className={cn(
                        "px-4 py-3 text-xs font-medium text-white/50 uppercase tracking-wider",
                        col.align === 'right' && "text-right",
                        col.align === 'center' && "text-center",
                        !col.align && "text-left"
                      )}
                      style={{ width: col.width }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {displayData.map((row, rowIdx) => (
                  <tr 
                    key={rowIdx}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    {columns.map((col, colIdx) => {
                      const value = col.key.toString().includes('.')
                        ? col.key.toString().split('.').reduce((acc: unknown, key) => (acc as Record<string, unknown>)?.[key], row)
                        : row[col.key as keyof T];
                      
                      return (
                        <td
                          key={colIdx}
                          className={cn(
                            "px-4 py-3.5 text-sm text-white/80",
                            col.align === 'right' && "text-right tabular-nums",
                            col.align === 'center' && "text-center"
                          )}
                        >
                          {col.render ? col.render(value, row) : String(value ?? '—')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PinnGlassCardContent>
    </PinnGlassCard>
  );
}

// Link cell renderer helper
export function PinnTableLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-orange-400 hover:text-orange-300 transition-colors"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// Status badge renderer helper
export function PinnTableBadge({ 
  status, 
  variant = 'default' 
}: { 
  status: string; 
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const variants = {
    default: "bg-white/10 text-white/60",
    success: "bg-emerald-500/15 text-emerald-400",
    warning: "bg-amber-500/15 text-amber-400",
    error: "bg-red-500/15 text-red-400",
  };

  return (
    <span className={cn(
      "inline-flex px-2 py-1 text-xs font-medium rounded-md",
      variants[variant]
    )}>
      {status}
    </span>
  );
}
