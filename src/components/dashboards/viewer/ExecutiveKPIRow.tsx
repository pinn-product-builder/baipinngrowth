import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  DollarSign, 
  Users, 
  Target, 
  Percent,
  HelpCircle,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { 
  getColumnLabel, 
  formatColumnValue, 
  getGoalDirection, 
  getColumnDescription,
  EXECUTIVE_KPIS,
  EXECUTIVE_KPIS_V3,
  type ColumnLabel,
} from './labelMap';

interface KPIData {
  key: string;
  value: number;
  previousValue?: number;
  sparkline?: number[];
  goal?: number;
}

interface ExecutiveKPIRowProps {
  data: Record<string, number>;
  previousData?: Record<string, number>;
  dailyData?: Record<string, any>[];
  goals?: Record<string, number>;
  comparisonEnabled?: boolean;
  className?: string;
}

const KPI_ICONS: Record<string, React.ElementType> = {
  // Legacy fields
  custo_total: DollarSign,
  leads_total: Users,
  cpl: DollarSign,
  cac: DollarSign,
  venda_total: Target,
  taxa_venda_total: Percent,
  // V3 fields
  spend: DollarSign,
  spend_7d: DollarSign,
  spend_30d: DollarSign,
  leads_new: Users,
  leads_total_7d: Users,
  leads_total_30d: Users,
  cpl_7d: DollarSign,
  cpl_30d: DollarSign,
  msg_in: Users,
  msg_in_7d: Users,
  msg_in_30d: Users,
  meetings_scheduled: Target,
  meetings_scheduled_7d: Target,
  meetings_scheduled_30d: Target,
  meetings_cancelled_7d: Target,
  cpm_meeting_7d: DollarSign,
  cpm_meeting_30d: DollarSign,
  conv_lead_to_msg_7d: Percent,
  conv_lead_to_msg_30d: Percent,
  conv_msg_to_meeting_7d: Percent,
  conv_msg_to_meeting_30d: Percent,
  calls_total_7d: Users,
  calls_total_30d: Users,
};

function SparklineChart({ data, isPositive }: { data: number[]; isPositive: boolean | null }) {
  const color = isPositive === true 
    ? 'hsl(145, 65%, 40%)' 
    : isPositive === false 
    ? 'hsl(0, 72%, 50%)' 
    : 'hsl(var(--primary))';
  
  return (
    <div className="w-16 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((v, i) => ({ v, i }))}>
          <Line 
            type="monotone" 
            dataKey="v" 
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KPICardExecutive({ 
  kpiKey, 
  value, 
  previousValue, 
  sparkline,
  goal,
  comparisonEnabled,
}: { 
  kpiKey: string;
  value: number;
  previousValue?: number;
  sparkline?: number[];
  goal?: number;
  comparisonEnabled?: boolean;
}) {
  const Icon = KPI_ICONS[kpiKey] || Target;
  const label = getColumnLabel(kpiKey);
  const description = getColumnDescription(kpiKey);
  const goalDirection = getGoalDirection(kpiKey);
  
  // Calculate delta
  const delta = useMemo(() => {
    if (!comparisonEnabled || previousValue === undefined || previousValue === 0) return null;
    const percentChange = ((value - previousValue) / previousValue) * 100;
    const absoluteChange = value - previousValue;
    return { percent: percentChange, absolute: absoluteChange };
  }, [value, previousValue, comparisonEnabled]);
  
  // Determine if change is positive (considering goal direction)
  const isPositive = useMemo(() => {
    if (!delta) return null;
    if (goalDirection === 'lower_better') {
      return delta.percent < 0;
    }
    return delta.percent > 0;
  }, [delta, goalDirection]);
  
  // Goal status
  const goalStatus = useMemo(() => {
    if (goal === undefined) return null;
    if (goalDirection === 'lower_better') {
      if (value <= goal) return 'achieved';
      if (value <= goal * 1.1) return 'close';
      return 'missed';
    } else {
      if (value >= goal) return 'achieved';
      if (value >= goal * 0.9) return 'close';
      return 'missed';
    }
  }, [value, goal, goalDirection]);
  
  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200",
      "hover:shadow-lg hover:scale-[1.02]",
      "border-l-4",
      goalStatus === 'achieved' && "border-l-success",
      goalStatus === 'close' && "border-l-warning",
      goalStatus === 'missed' && "border-l-destructive",
      !goalStatus && "border-l-transparent"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left side - main content */}
          <div className="flex-1 min-w-0">
            {/* Label with tooltip */}
            <div className="flex items-center gap-1.5 mb-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate cursor-help flex items-center gap-1">
                      {label}
                      {description && <HelpCircle className="h-3 w-3 opacity-50" />}
                    </span>
                  </TooltipTrigger>
                  {description && (
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-sm">{description}</p>
                      {goal !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Meta: {formatColumnValue(goal, kpiKey)}
                        </p>
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Value */}
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {formatColumnValue(value, kpiKey)}
            </p>
            
            {/* Delta */}
            {delta && (
              <div className={cn(
                "flex items-center gap-1.5 mt-1.5 text-sm",
                isPositive === true && "text-success",
                isPositive === false && "text-destructive",
                isPositive === null && "text-muted-foreground"
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
              </div>
            )}
            
            {/* Goal badge */}
            {goalStatus && (
              <div className="mt-2">
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs gap-1",
                    goalStatus === 'achieved' && "border-success/30 text-success bg-success/5",
                    goalStatus === 'close' && "border-warning/30 text-warning bg-warning/5",
                    goalStatus === 'missed' && "border-destructive/30 text-destructive bg-destructive/5"
                  )}
                >
                  {goalStatus === 'achieved' && <CheckCircle className="h-3 w-3" />}
                  {goalStatus === 'close' && <AlertCircle className="h-3 w-3" />}
                  {goalStatus === 'missed' && <AlertCircle className="h-3 w-3" />}
                  {goalStatus === 'achieved' ? 'Meta atingida' : 
                   goalStatus === 'close' ? 'Próximo da meta' : 'Abaixo da meta'}
                </Badge>
              </div>
            )}
          </div>
          
          {/* Right side - sparkline */}
          {sparkline && sparkline.length > 1 && (
            <SparklineChart data={sparkline} isPositive={isPositive} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExecutiveKPIRow({
  data,
  previousData,
  dailyData = [],
  goals = {},
  comparisonEnabled = false,
  className,
}: ExecutiveKPIRowProps) {
  // Build KPIs from data - only show metrics that exist
  // First try v3 KPIs, then fallback to legacy
  const kpis = useMemo(() => {
    const result: KPIData[] = [];
    
    // Check if we have v3 data
    const hasV3Data = EXECUTIVE_KPIS_V3.some(key => data[key] !== undefined && isFinite(data[key]));
    const kpiList = hasV3Data ? EXECUTIVE_KPIS_V3 : EXECUTIVE_KPIS;
    
    kpiList.forEach(key => {
      if (data[key] !== undefined && isFinite(data[key])) {
        // For sparklines, map v3 fields to daily data
        const sparklineKey = key.replace('_7d', '').replace('_30d', '');
        result.push({
          key,
          value: data[key],
          previousValue: previousData?.[key],
          sparkline: dailyData.map(row => {
            // Try exact key first, then the base key
            const val = row[key] ?? row[sparklineKey];
            return typeof val === 'number' && isFinite(val) ? val : 0;
          }),
          goal: goals[key],
        });
      }
    });
    
    return result;
  }, [data, previousData, dailyData, goals]);
  
  if (kpis.length === 0) return null;
  
  return (
    <div className={cn("grid gap-4", className)}>
      {/* Responsive grid: 2 cols on mobile, 3 on md, up to 6 on xl */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <KPICardExecutive
            key={kpi.key}
            kpiKey={kpi.key}
            value={kpi.value}
            previousValue={kpi.previousValue}
            sparkline={kpi.sparkline}
            goal={kpi.goal}
            comparisonEnabled={comparisonEnabled}
          />
        ))}
      </div>
    </div>
  );
}
