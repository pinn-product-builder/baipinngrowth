// ============================================================
// PINN GLASS CARD - Card com glassmorphism estilo Pinn
// ============================================================

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface PinnGlassCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
}

export function PinnGlassCard({ 
  children, 
  className, 
  glow = false,
  hover = true 
}: PinnGlassCardProps) {
  return (
    <div
      className={cn(
        // Base glassmorphism
        "relative rounded-2xl",
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
        "backdrop-blur-xl",
        "border border-white/[0.08]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
        // Hover effect
        hover && "transition-all duration-300 hover:border-white/[0.15] hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)]",
        // Glow effect for important cards
        glow && "shadow-[0_0_40px_rgba(255,107,0,0.15)]",
        className
      )}
    >
      {/* Subtle inner glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export function PinnGlassCardHeader({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string; 
}) {
  return (
    <div className={cn(
      "px-6 py-4 border-b border-white/[0.06]",
      className
    )}>
      {children}
    </div>
  );
}

export function PinnGlassCardContent({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string; 
}) {
  return (
    <div className={cn("p-6", className)}>
      {children}
    </div>
  );
}
