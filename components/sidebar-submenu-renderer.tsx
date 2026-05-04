'use client'

import React, { Suspense } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar'
import { MODULE_SUBMENUS } from '@/lib/generated/module-submenu-registry'
import type { ModuleSubmenuProps } from '@/lib/modules/submenu-types'
import type { ModuleMetadata } from '@/lib/modules/module-types'

// Re-export so existing consumer imports from this file keep working
export type { ModuleSubmenuProps }

// Module-level cache so lazy components survive unmount/remount cycles
const lazyCache = new Map<string, React.LazyExoticComponent<React.ComponentType<ModuleSubmenuProps>>>()

function getLazySubmenu(moduleId: string) {
  if (lazyCache.has(moduleId)) return lazyCache.get(moduleId)!
  const loader = MODULE_SUBMENUS[moduleId]
  if (!loader) return null
  const lazy = React.lazy(loader)
  lazyCache.set(moduleId, lazy)
  return lazy
}

interface SubmenuRendererProps {
  moduleId: string
  module: ModuleMetadata
  onBack: () => void
}

export function SubmenuRenderer({ moduleId, module, onBack }: SubmenuRendererProps) {
  const LazySubmenu = getLazySubmenu(moduleId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back Header */}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenuButton onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 size-4" />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Submenu Content */}
      <div className="flex-1 overflow-auto">
        {LazySubmenu ? (
          <Suspense fallback={
            <div className="flex items-center justify-center p-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          }>
            <LazySubmenu moduleId={moduleId} module={module} />
          </Suspense>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Submenu component not found</div>
        )}
      </div>
    </div>
  )
}
