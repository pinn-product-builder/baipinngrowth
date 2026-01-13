// ============================================================
// PINN PERIOD SELECTOR - Seletor de período estilo Pinn
// ============================================================

import { cn } from '@/lib/utils';

interface PinnPeriodSelectorProps {
  options: { label: string; value: number }[];
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
      className
    )}>
      {options.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => onSelect(value)}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            selected === value
              ? "bg-pinn-orange text-white shadow-lg shadow-pinn-orange/25"
              : "text-white/60 hover:text-white hover:bg-white/[0.05]"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
