"use client"

import * as React from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

interface TopBarProps {
  children?: React.ReactNode
}

export function TopBar({ children }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      {children}
    </header>
  )
}
