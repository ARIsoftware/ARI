'use client'

import type { ModuleMetadata } from '@/lib/modules/module-types'
import { ArrowLeft } from 'lucide-react'
import {
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar'

// Static imports for submenu components
// IMPORTANT: Use @/modules/ alias (not @/modules-core/ or @/modules-custom/)
// so modules can be moved between directories without code changes
import HelloWorldSubmenu from '@/modules/hello-world/components/sidebar-submenu'
import MailStreamSubmenu from '@/modules/mail-stream/components/sidebar-submenu'
import BackupManagerSubmenu from '@/modules/backup-manager/components/sidebar-submenu'
import DocumentsSubmenu from '@/modules/documents/components/sidebar-submenu'
import BaseballSubmenu from '@/modules/baseball/components/sidebar-submenu'

/**
 * Props passed to module submenu components
 */
export interface ModuleSubmenuProps {
  /** Module ID this submenu belongs to */
  moduleId: string
  /** Module metadata for reference */
  module: ModuleMetadata
}

/**
 * Registry of submenu components
 * Add new modules here as they implement submenus
 */
const SUBMENU_COMPONENTS: Record<string, React.ComponentType<ModuleSubmenuProps>> = {
  'hello-world': HelloWorldSubmenu,
  'mail-stream': MailStreamSubmenu,
  'backup-manager': BackupManagerSubmenu,
  'documents': DocumentsSubmenu,
  'baseball': BaseballSubmenu,
}

interface SubmenuRendererProps {
  moduleId: string
  module: ModuleMetadata
  onBack: () => void
}

export function SubmenuRenderer({ moduleId, module, onBack }: SubmenuRendererProps) {
  const SubmenuComponent = SUBMENU_COMPONENTS[moduleId]

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
        {SubmenuComponent ? (
          <SubmenuComponent moduleId={moduleId} module={module} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Submenu component not found</div>
        )}
      </div>
    </div>
  )
}
