'use client'

import React, { Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
  useMobileHeaderBack,
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
  const { isMobile, setOpenMobile } = useSidebar()

  // On mobile the "Back" control lives in the sheet header (aligned with the
  // close button); register it there instead of rendering it in the content.
  useMobileHeaderBack(isMobile, onBack)

  // On mobile the submenu fills the screen, so tapping a link must also close
  // the sheet. The per-module submenu links live in core module components we
  // can't edit, so close via delegation when any link inside is activated.
  const handleContentClick = (e: React.MouseEvent) => {
    if (isMobile && (e.target as HTMLElement).closest('a')) {
      setOpenMobile(false)
    }
  }

  return (
    <div className="mobile-sub-nav flex flex-col h-full overflow-hidden" onClick={handleContentClick}>
      {/* Back header — desktop only; on mobile it renders in the sheet header */}
      {!isMobile && (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenuButton onClick={onBack} className="w-full">
              <ArrowLeft className="mr-2 size-4" />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* Submenu Content */}
      <div className="flex-1 overflow-auto">
        {LazySubmenu ? (
          // No spinner while the submenu chunk loads — it's a tiny list of links
          // and resolves almost instantly. Rendering null (then the menu) is
          // cleaner than flashing a spinner, matching app/[module]/[[...slug]]/loading.tsx.
          <Suspense fallback={null}>
            <LazySubmenu moduleId={moduleId} module={module} />
          </Suspense>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Submenu component not found</div>
        )}
      </div>
    </div>
  )
}
