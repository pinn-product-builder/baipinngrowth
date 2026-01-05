import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface KpiCardProps {
  label: string;
  value: string;
  previousValue?: number;
  currentValue?: number;
  icon?: React.ComponentType<{ className?: string }>;
  tooltip?: string;
  sparklineData?: number[];
  target?: number;
  format?: 'currency' | 'percent' | 'integer';
  size?: 'default' | 'large';
}

const formatVariation = (current: number, previous: number): { text: string; isPositive: boolean | null } => {
  if (!previous || previous === 0) return { text: '-', isPositive: null };
  const variation = ((current - previous) / previous) * 100;
  const sign = variation > 0 ? '+' : '';
  return {
    text: `${sign}${variation.toFixed(1)}%`,
    isPositive: variation > 0 ? true : variation < 0 ? false : null
  };
};

export default function KpiCard({ 
  label, 
  value, 
  previousValue, 
  currentValue, 
  icon: Icon,
  tooltip,
  sparklineData,
  target,
  format = 'integer',
  size = 'default'
}: KpiCardProps) {
  const variation = useMemo(() => {
    if (currentValue !== undefined && previousValue !== undefined) {
      return formatVariation(currentValue, previousValue);
    }
    return null;
  }, [currentValue, previousValue]);

  // Determine if meeting target (for CAC/CPL, lower is better)
  const targetStatus = useMemo(() => {
    if (!target || currentValue === undefined) return null;
    const isLowerBetter = format === 'currency'; // CPL, CAC - lower is better
    if (isLowerBetter) {
      return currentValue <= target ? 'success' : 'danger';
    }
    return currentValue >= target ? 'success' : 'danger';
  }, [target, currentValue, format]);

  const chartData = useMemo(() => {
    if (!sparklineData) return [];
    return sparklineData.map((v, i) => ({ value: v, index: i }));
  }, [sparklineData]);

  const CardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (!tooltip) return <>{children}</>;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent className="max-w-[250px]">
            <p className="text-sm">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <CardWrapper>
      <Card 
        className={cn(
          "relative overflow-hidden transition-all hover:shadow-md cursor-default group",
          targetStatus === 'success' && "ring-1 ring-success/30",
          targetStatus === 'danger' && "ring-1 ring-destructive/30"
        )}
      >
        {/* Target indicator bar */}
        {targetStatus && (
          <div 
            className={cn(
              "absolute top-0 left-0 right-0 h-1",
              targetStatus === 'success' && "bg-success",
              targetStatus === 'danger' && "bg-destructive"
            )} 
          />
        )}
        
        <CardContent className={cn(
          "pt-4",
          size === 'large' && "py-6"
        )}>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 flex-1 min-w-0">
              <p className={cn(
                "text-muted-foreground truncate",
                size === 'large' ? "text-sm font-medium" : "text-xs"
              )}>
                {label}
              </p>
              <p className={cn(
                "font-bold tabular-nums tracking-tight",
                size === 'large' ? "text-3xl" : "text-2xl"
              )}>
                {value}
              </p>
              
              {/* Variation */}
              {variation && (
                <div className={cn(
                  "flex items-center gap-1 text-xs",
                  variation.isPositive === true && "text-success",
                  variation.isPositive === false && "text-destructive",
                  variation.isPositive === null && "text-muted-foreground"
                )}>
                  {variation.isPositive === true && <TrendingUp className="h-3 w-3" />}
                  {variation.isPositive === false && <TrendingDown className="h-3 w-3" />}
                  {variation.isPositive === null && <Minus className="h-3 w-3" />}
                  <span>{variation.text} vs período anterior</span>
                </div>
              )}
            </div>
            
            {/* Icon */}
            {Icon && (
              <div className="rounded-full p-2 bg-muted shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Sparkline */}
          {chartData.length > 0 && (
            <div className="mt-3 h-8 opacity-60 group-hover:opacity-100 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
