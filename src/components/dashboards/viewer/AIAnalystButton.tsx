import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIAnalystButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}

export default function AIAnalystButton({ onClick, className, disabled }: AIAnalystButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="default"
      className={cn(
        "fixed bottom-6 right-6 z-50 shadow-lg gap-2",
        "bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90",
        "transition-all duration-200 hover:scale-105",
        className
      )}
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden sm:inline">Perguntar ao Analista</span>
      <span className="sm:hidden">AI</span>
    </Button>
  );
}
