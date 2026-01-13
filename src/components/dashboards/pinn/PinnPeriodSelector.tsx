// ============================================================
// PINN PERIOD SELECTOR - Premium period filter component
// ============================================================

import { cn } from '@/lib/utils';

interface PeriodOption {
  label: string;
  value: number;
}

interface PinnPeriodSelectorProps {
  options: PeriodOption[];
  selected: number | null;
  onSelect: (value: number) => void;
  className?: string;
}

export function PinnPeriodSelector({
  options,
  selected,
  onSelect,
  className,
}: PinnPeriodSelectorProps) {
  return (
    <div className={cn(
      "flex items-center gap-1 p-1 rounded-xl",
      "bg-white/[0.05] border border-white/[0.08]",
      "backdrop-blur-sm",
      className
    )}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
            selected === option.value
              ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-[0_4px_12px_rgba(255,107,0,0.3)]"
              : "text-white/50 hover:text-white hover:bg-white/[0.08]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
