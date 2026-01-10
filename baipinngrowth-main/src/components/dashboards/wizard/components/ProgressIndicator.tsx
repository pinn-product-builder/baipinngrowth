/**
 * Progress Indicator Component
 * Shows wizard progress steps
 */

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { WizardStep } from '../constants';

export interface ProgressStep {
  id: WizardStep;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep: WizardStep;
}

export default function ProgressIndicator({ steps, currentStep }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isPast = steps.findIndex(s => s.id === currentStep) > index;

        let icon = <Circle className="h-4 w-4 text-muted-foreground" />;
        let statusColor = 'text-muted-foreground';

        if (step.status === 'done' || isPast) {
          icon = <CheckCircle2 className="h-4 w-4 text-green-500" />;
          statusColor = 'text-green-500';
        } else if (step.status === 'running' || isActive) {
          icon = <Loader2 className="h-4 w-4 animate-spin text-primary" />;
          statusColor = 'text-primary';
        } else if (step.status === 'error') {
          icon = <XCircle className="h-4 w-4 text-destructive" />;
          statusColor = 'text-destructive';
        }

        return (
          <div key={step.id} className="flex items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1 ${statusColor}`}>
              {icon}
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className="h-px w-8 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}


