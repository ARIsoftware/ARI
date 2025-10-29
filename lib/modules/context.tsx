'use client';

import { createContext, useContext } from 'react';

interface ModulesContextType {
  modules: string[];
}

const ModulesContext = createContext<ModulesContextType | undefined>(undefined);

interface ModulesProviderProps {
  modules: string[];
  children: React.ReactNode;
}

/**
 * Provider that makes the list of installed modules available to client components
 * Must be wrapped in the app with the modules list passed from the server
 */
export function ModulesProvider({ modules, children }: ModulesProviderProps) {
  return (
    <ModulesContext.Provider value={{ modules }}>
      {children}
    </ModulesContext.Provider>
  );
}

/**
 * Hook to access the modules context
 * For internal use - most components should use isModuleInstalled() from '@/lib/modules/client'
 */
export function useModulesContext(): ModulesContextType {
  const context = useContext(ModulesContext);
  if (context === undefined) {
    throw new Error('useModulesContext must be used within ModulesProvider');
  }
  return context;
}
