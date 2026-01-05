import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  LineChart, 
  Line, 
  ResponsiveContainer 
} from 'recharts';

type GoalStatus = 'above' | 'below' | 'at' | 'none';

interface KPICardProps {
  label: string;
  value: number;
  previousValue?: number;
  goal?: number;
  goalDirection?: 'higher_better' | 'lower_better';
  format?: 'currency' | 'integer' | 'percent';
  icon?: React.ReactNode;
  sparklineData?: number[];
  className?: string;
}

const formatValue = (value: number, format: string): string => {
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    case 'percent':
      return `${((value || 0) * 100).toFixed(1)}%`;
    case 'integer':
    default:
      return (value || 0).toLocaleString('pt-BR');
  }
};

const getGoalStatus = (
  value: number, 
  goal: number, 
  direction: 'higher_better' | 'lower_better'
): GoalStatus => {
  if (direction === 'higher_better') {
    if (value >= goal) return 'above';
    if (value >= goal * 0.9) return 'at';
    return 'below';
  } else {
    if (value <= goal) return 'above';
    if (value <= goal * 1.1) return 'at';
    return 'below';
  }
};

const GoalBadge = ({ status, goal, format }: { status: GoalStatus; goal: number; format: string }) => {
  if (status === 'none') return null;
  
  const config = {
    above: { 
      icon: CheckCircle, 
      className: 'bg-success/10 text-success border-success/20',
      label: 'Meta atingida'
    },
    at: { 
      icon: Target, 
      className: 'bg-warning/10 text-warning border-warning/20',
      label: 'Próximo da meta'
    },
    below: { 
      icon: AlertTriangle, 
      className: 'bg-destructive/10 text-destructive border-destructive/20',
      label: 'Abaixo da meta'
    },
    none: { icon: Target, className: '', label: '' }
  };
  
  const { icon: Icon, className, label } = config[status];
  
  return (
    <Badge variant="outline" className={cn("text-xs gap-1 font-normal", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

export default function KPICard({
  label,
  value,
  previousValue,
  goal,
  goalDirection = 'higher_better',
  format = 'integer',
  icon,
  sparklineData,
  className,
}: KPICardProps) {
  // Calculate delta
  const delta = useMemo(() => {
    if (previousValue === undefined || previousValue === 0) return null;
    const percentChange = ((value - previousValue) / previousValue) * 100;
    const absoluteChange = value - previousValue;
    return { percent: percentChange, absolute: absoluteChange };
  }, [value, previousValue]);

  // Determine if delta is positive/negative (considering goal direction)
  const isDeltaPositive = useMemo(() => {
    if (!delta) return null;
    if (goalDirection === 'lower_better') {
      return delta.percent < 0;
    }
    return delta.percent > 0;
  }, [delta, goalDirection]);

  // Goal status
  const goalStatus: GoalStatus = useMemo(() => {
    if (goal === undefined) return 'none';
    return getGoalStatus(value, goal, goalDirection);
  }, [value, goal, goalDirection]);

  // Sparkline color
  const sparklineColor = isDeltaPositive === true ? 'hsl(145, 65%, 40%)' : 
                         isDeltaPositive === false ? 'hsl(0, 72%, 50%)' : 
                         'hsl(var(--primary))';

  return (
    <Card className={cn("overflow-hidden transition-shadow hover:shadow-md", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {icon && <span className="text-muted-foreground">{icon}</span>}
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                {label}
              </p>
            </div>
            
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {formatValue(value, format)}
            </p>
            
            {/* Delta */}
            {delta && (
              <div className={cn(
                "flex items-center gap-1.5 mt-1 text-sm",
                isDeltaPositive === true ? "text-success" :
                isDeltaPositive === false ? "text-destructive" :
                "text-muted-foreground"
              )}>
                {delta.percent > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : delta.percent < 0 ? (
                  <TrendingDown className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
                <span className="font-medium tabular-nums">
                  {delta.percent > 0 ? '+' : ''}{delta.percent.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  ({delta.absolute > 0 ? '+' : ''}{formatValue(delta.absolute, format)})
                </span>
              </div>
            )}
            
            {/* Goal Badge */}
            {goal !== undefined && (
              <div className="mt-2">
                <GoalBadge status={goalStatus} goal={goal} format={format} />
              </div>
            )}
          </div>
          
          {/* Sparkline */}
          {sparklineData && sparklineData.length > 1 && (
            <div className="w-20 h-12 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData.map((v, i) => ({ v, i }))}>
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke={sparklineColor}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
