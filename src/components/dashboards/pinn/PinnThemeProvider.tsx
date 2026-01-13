// ============================================================
// PINN THEME PROVIDER - Tema dark premium com acento laranja
// ============================================================

import { createContext, useContext, useEffect, ReactNode } from 'react';

const PinnThemeContext = createContext<{ isPinn: boolean }>({ isPinn: false });

export function usePinnTheme() {
  return useContext(PinnThemeContext);
}

interface PinnThemeProviderProps {
  children: ReactNode;
}

export function PinnThemeProvider({ children }: PinnThemeProviderProps) {
  useEffect(() => {
    // Add Pinn theme class to body
    document.body.classList.add('pinn-theme');
    
    return () => {
      document.body.classList.remove('pinn-theme');
    };
  }, []);
  
  return (
    <PinnThemeContext.Provider value={{ isPinn: true }}>
      {children}
    </PinnThemeContext.Provider>
  );
}
