// ============================================================
// PINN GLASS CARD - Premium glassmorphism component
// ============================================================

import * as React from 'react';
import { cn } from '@/lib/utils';

interface PinnGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  variant?: 'default' | 'elevated' | 'subtle';
}

export const PinnGlassCard = React.forwardRef<HTMLDivElement, PinnGlassCardProps>(({ 
  children, 
  className, 
  glow = false,
  hover = true,
  variant = 'default',
  ...props
}, ref) => {
  const variantStyles = {
    default: "from-white/[0.08] to-white/[0.02] border-white/[0.08]",
    elevated: "from-white/[0.12] to-white/[0.04] border-white/[0.12]",
    subtle: "from-white/[0.04] to-white/[0.01] border-white/[0.06]",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-2xl overflow-hidden",
        "bg-gradient-to-br",
        variantStyles[variant],
        "backdrop-blur-xl",
        "border",
        "shadow-glass",
        hover && "transition-all duration-300 hover:border-white/[0.15] hover:shadow-glass-hover",
        glow && "shadow-pinn-glow animate-glow-pulse",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      {glow && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-pinn-orange/10 rounded-full blur-3xl pointer-events-none" />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
});
PinnGlassCard.displayName = 'PinnGlassCard';

interface CardSubProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const PinnGlassCardHeader = React.forwardRef<HTMLDivElement, CardSubProps>(({ 
  children, 
  className,
  ...props
}, ref) => (
  <div 
    ref={ref}
    className={cn("px-5 py-4 border-b border-white/[0.06]", className)} 
    {...props}
  >
    {children}
  </div>
));
PinnGlassCardHeader.displayName = 'PinnGlassCardHeader';

export const PinnGlassCardContent = React.forwardRef<HTMLDivElement, CardSubProps>(({ 
  children, 
  className,
  ...props
}, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props}>
    {children}
  </div>
));
PinnGlassCardContent.displayName = 'PinnGlassCardContent';

export const PinnGlassCardFooter = React.forwardRef<HTMLDivElement, CardSubProps>(({ 
  children, 
  className,
  ...props
}, ref) => (
  <div 
    ref={ref}
    className={cn("px-5 py-4 border-t border-white/[0.06] bg-white/[0.02]", className)} 
    {...props}
  >
    {children}
  </div>
));
PinnGlassCardFooter.displayName = 'PinnGlassCardFooter';
