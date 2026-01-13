// ============================================================
// PINN GLASS CARD - Premium glassmorphism component
// ============================================================

import * as React from 'react';
import { cn } from '@/lib/utils';

interface PinnGlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'subtle';
}

export function PinnGlassCard({ 
  children, 
  className, 
  glow = false,
  hover = true,
  variant = 'default',
}: PinnGlassCardProps) {
  const variantStyles = {
    default: "from-white/[0.08] to-white/[0.02] border-white/[0.08]",
    elevated: "from-white/[0.12] to-white/[0.04] border-white/[0.12]",
    subtle: "from-white/[0.04] to-white/[0.01] border-white/[0.06]",
  };

  return (
    <div
      className={cn(
        // Base glassmorphism
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-br",
        variantStyles[variant],
        "backdrop-blur-xl",
        "border",
        "shadow-glass",
        // Hover effect
        hover && "transition-all duration-300 hover:border-white/[0.15] hover:shadow-glass-hover",
        // Glow effect for important cards
        glow && "shadow-pinn-glow animate-glow-pulse",
        className
      )}
    >
      {/* Subtle inner glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      
      {/* Orange accent glow for glowing cards */}
      {glow && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-pinn-orange/10 rounded-full blur-3xl pointer-events-none" />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

// Card sub-components
export function PinnGlassCardHeader({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn(
      "px-5 py-4 border-b border-white/[0.06]",
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
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn("p-5", className)}>
      {children}
    </div>
  );
}

export function PinnGlassCardFooter({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn(
      "px-5 py-4 border-t border-white/[0.06] bg-white/[0.02]",
      className
    )}>
      {children}
    </div>
  );
}
