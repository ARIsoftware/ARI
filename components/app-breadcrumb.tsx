"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEnabledModulesFromContext } from "@/lib/modules/context"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

/**
 * Pathname-derived breadcrumb rendered once inside the shared app shell
 * (app/(app)/layout.tsx). Reproduces the three shapes the per-page shells used:
 *
 *   /modules         -> "Modules"
 *   /settings        -> "Settings"
 *   /dashboard       -> "Dashboard"
 *   /<module>[/...]  -> "Dashboard > <module display name>"
 *
 * It reads usePathname() so it re-renders on soft navigation even though the
 * server layout above it does not. The modules list is server-seeded via
 * ModulesProvider, so the module name is available on first paint (SSR-safe).
 */
export function AppBreadcrumb() {
  const pathname = usePathname()
  const enabledModules = useEnabledModulesFromContext()

  const segment = pathname.split("/").filter(Boolean)[0] ?? ""

  // Static top-level pages inside the group render a single label. Dashboard
  // included — "Dashboard > Dashboard" would just repeat itself.
  if (segment === "modules" || segment === "settings" || segment === "dashboard") {
    const label =
      segment === "modules" ? "Modules" : segment === "settings" ? "Settings" : "Dashboard"
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{label}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    )
  }

  // Everything else is served by the module catch-all: Dashboard > <name>.
  if (!segment) return null
  const moduleName =
    enabledModules.find((m) => m.id === segment)?.name ?? segment

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{moduleName}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
