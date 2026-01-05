import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeftRight } from 'lucide-react';

interface ComparisonToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function ComparisonToggle({ enabled, onChange }: ComparisonToggleProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
      <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
      <Label htmlFor="comparison-mode" className="text-sm cursor-pointer">
        Comparar períodos
      </Label>
      <Switch
        id="comparison-mode"
        checked={enabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}
