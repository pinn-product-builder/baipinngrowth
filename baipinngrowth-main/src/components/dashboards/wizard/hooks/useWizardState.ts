/**
 * Hook para gerenciar o estado do wizard
 */

import { useState, useCallback } from 'react';
import type { WizardStep } from '../constants';

export interface WizardState {
  currentStep: WizardStep;
  selectedDatasetId: string | null;
  canGoNext: boolean;
  canGoBack: boolean;
}

const STEP_ORDER: WizardStep[] = ['select', 'analyze', 'mapping', 'prompt', 'generate', 'preview', 'save'];

export function useWizardState(initialStep: WizardStep = 'select') {
  const [currentStep, setCurrentStep] = useState<WizardStep>(initialStep);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const goNext = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      setCurrentStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [currentStep]);

  const canGoNext = STEP_ORDER.indexOf(currentStep) < STEP_ORDER.length - 1;
  const canGoBack = STEP_ORDER.indexOf(currentStep) > 0;

  return {
    currentStep,
    selectedDatasetId,
    setSelectedDatasetId,
    goToStep,
    goNext,
    goBack,
    canGoNext,
    canGoBack
  };
}


