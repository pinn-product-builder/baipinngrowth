import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, subDays, startOfDay, endOfDay, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, RefreshCw, Download, Copy, CheckCheck, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface DateRange {
  start: Date;
  end: Date;
}

interface DashboardFilterBarProps {
  onDateRangeChange: (range: DateRange, previousRange?: DateRange) => void;
  onRefresh: () => void;
  onExport?: () => void;
  onCopyLink: () => void;
  isRefreshing?: boolean;
  copied?: boolean;
  comparisonEnabled?: boolean;
  onComparisonToggle?: (enabled: boolean) => void;
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
];

export default function DashboardFilterBar({
  onDateRangeChange,
  onRefresh,
  onExport,
  onCopyLink,
  isRefreshing = false,
  copied = false,
  comparisonEnabled = false,
  onComparisonToggle,
}: DashboardFilterBarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    
    if (startParam && endParam) {
      const start = parseISO(startParam);
      const end = parseISO(endParam);
      if (isValid(start) && isValid(end)) {
        return { start, end };
      }
    }
    
    // Default: last 30 days
    return {
      start: startOfDay(subDays(new Date(), 30)),
      end: endOfDay(new Date()),
    };
  });
  
  const [selectedPreset, setSelectedPreset] = useState<number | null>(() => {
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    if (!startParam || !endParam) return 30;
    return null;
  });

  const [isCompareEnabled, setIsCompareEnabled] = useState(() => {
    return searchParams.get('compare') === 'true';
  });

  // Sync URL params on mount and date change
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('start', format(dateRange.start, 'yyyy-MM-dd'));
    newParams.set('end', format(dateRange.end, 'yyyy-MM-dd'));
    if (isCompareEnabled) {
      newParams.set('compare', 'true');
    } else {
      newParams.delete('compare');
    }
    setSearchParams(newParams, { replace: true });
  }, [dateRange, isCompareEnabled]);

  // Calculate previous period for comparison
  const getPreviousPeriod = useCallback((range: DateRange): DateRange => {
    const daysDiff = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    return {
      start: subDays(range.start, daysDiff),
      end: subDays(range.end, daysDiff),
    };
  }, []);

  // Trigger callback when dates or comparison changes
  useEffect(() => {
    const previousRange = isCompareEnabled ? getPreviousPeriod(dateRange) : undefined;
    onDateRangeChange(dateRange, previousRange);
    onComparisonToggle?.(isCompareEnabled);
  }, [dateRange, isCompareEnabled, getPreviousPeriod, onDateRangeChange, onComparisonToggle]);

  const handlePresetClick = (days: number) => {
    const newRange = {
      start: startOfDay(subDays(new Date(), days)),
      end: endOfDay(new Date()),
    };
    setDateRange(newRange);
    setSelectedPreset(days);
  };

  const handleDateSelect = (date: Date | undefined, type: 'start' | 'end') => {
    if (!date) return;
    setSelectedPreset(null);
    setDateRange(prev => ({
      ...prev,
      [type]: type === 'start' ? startOfDay(date) : endOfDay(date),
    }));
  };

  const handleCompareToggle = (checked: boolean) => {
    setIsCompareEnabled(checked);
  };

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* Date Range Pickers */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 text-sm">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.start, 'dd/MM/yyyy', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.start}
                onSelect={(date) => handleDateSelect(date, 'start')}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
          
          <span className="text-muted-foreground text-sm">até</span>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 text-sm">
                <CalendarIcon className="h-4 w-4" />
                {format(dateRange.end, 'dd/MM/yyyy', { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.end}
                onSelect={(date) => handleDateSelect(date, 'end')}
                initialFocus
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Preset Buttons */}
        <div className="flex items-center gap-1 border-l pl-2 ml-1">
          {PRESETS.map(preset => (
            <Button
              key={preset.days}
              variant={selectedPreset === preset.days ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-8 px-2.5 text-xs font-medium",
                selectedPreset === preset.days && "bg-primary/10 text-primary"
              )}
              onClick={() => handlePresetClick(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Compare Toggle */}
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Switch
            id="compare-mode"
            checked={isCompareEnabled}
            onCheckedChange={handleCompareToggle}
            className="data-[state=checked]:bg-primary"
          />
          <Label htmlFor="compare-mode" className="text-sm cursor-pointer">
            <span className="hidden sm:inline">Comparar período</span>
            <BarChart3 className="h-4 w-4 sm:hidden" />
          </Label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyLink}
            className="h-9"
          >
            {copied ? <CheckCheck className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? 'Copiado' : 'Copiar link'}</span>
          </Button>
          
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="h-9"
            >
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="ml-2 hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Comparison Period Indicator */}
      {isCompareEnabled && (
        <div className="px-3 pb-2 text-xs text-muted-foreground">
          Comparando com: {format(getPreviousPeriod(dateRange).start, 'dd/MM', { locale: ptBR })} - {format(getPreviousPeriod(dateRange).end, 'dd/MM', { locale: ptBR })}
        </div>
      )}
    </div>
  );
}
