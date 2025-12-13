'use client';

import { createContext, useContext } from 'react';
import type { ModuleMetadata } from './module-types';

interface ModulesContextType {
  /** List of installed module IDs */
  modules: string[];
  /** Pre-fetched enabled modules (server-side loaded) */
  enabledModules: ModuleMetadata[];
}

const ModulesContext = createContext<ModulesContextType | undefined>(undefined);

interface ModulesProviderProps {
  /** List of installed module IDs */
  modules: string[];
  /** Pre-fetched enabled modules from server-side */
  enabledModules?: ModuleMetadata[];
  children: React.ReactNode;
}

/**
 * Provider that makes the list of installed modules available to client components
 * Must be wrapped in the app with the modules list passed from the server
 *
 * Also provides pre-fetched enabled modules to avoid client-side loading states
 */
export function ModulesProvider({ modules, enabledModules = [], children }: ModulesProviderProps) {
  return (
    <ModulesContext.Provider value={{ modules, enabledModules }}>
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

/**
 * Hook to get enabled modules from context
 * Returns server-side pre-fetched modules (no loading state needed)
 */
export function useEnabledModulesFromContext(): ModuleMetadata[] {
  const context = useModulesContext();
  return context.enabledModules;
}
