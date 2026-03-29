"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"

interface DragDropModeContextType {
  isDragMode: boolean
  setDragMode: (mode: boolean) => void
  pendingOrder: Record<string, number> | null
  setPendingOrder: (order: Record<string, number> | null) => void
  pendingIconOrder: Record<string, number> | null
  setPendingIconOrder: (order: Record<string, number> | null) => void
  iconOrder: Record<string, number> | null
  moduleOrder: Record<string, number> | null
  saveOrder: () => Promise<void>
}

const DragDropModeContext = createContext<DragDropModeContextType | null>(null)

export function DragDropModeProvider({ children, isAuthenticated, isAuthLoading }: { children: React.ReactNode; isAuthenticated: boolean; isAuthLoading: boolean }) {
  const [isDragMode, setIsDragMode] = useState(false)
  const [pendingOrder, setPendingOrder] = useState<Record<string, number> | null>(null)
  const [pendingIconOrder, setPendingIconOrder] = useState<Record<string, number> | null>(null)
  const [iconOrder, setIconOrder] = useState<Record<string, number> | null>(null)
  const [moduleOrder, setModuleOrder] = useState<Record<string, number> | null>(null)

  // Use ref to access pendingOrder in saveOrder without stale closure
  const pendingOrderRef = useRef<Record<string, number> | null>(null)
  pendingOrderRef.current = pendingOrder

  // Use ref to access pendingIconOrder in saveOrder without stale closure
  const pendingIconOrderRef = useRef<Record<string, number> | null>(null)
  pendingIconOrderRef.current = pendingIconOrder

  // Load icon order and module order on mount (only if authenticated)
  useEffect(() => {
    // Skip API call if not authenticated or still checking auth
    if (isAuthLoading || !isAuthenticated) return

    fetch("/api/modules/order")
      .then(response => {
        if (response.ok) return response.json()
        throw new Error("Failed to fetch orders")
      })
      .then(data => {
        if (data.iconOrder) {
          setIconOrder(data.iconOrder)
        }
        if (data.moduleOrder) {
          setModuleOrder(data.moduleOrder)
        }
      })
      .catch(error => {
        console.error("[DragDrop] Failed to load orders:", error)
      })
  }, [isAuthLoading, isAuthenticated])

  // Ref for keyboard shortcut to read current drag mode without stale closure
  const isDragModeRef = useRef(false)
  isDragModeRef.current = isDragMode

  const setDragMode = useCallback((mode: boolean) => {
    setIsDragMode(mode)
    // Reset pending orders when exiting drag mode
    if (!mode) {
      setPendingOrder(null)
      setPendingIconOrder(null)
    }
  }, [])

  // Optimistic save - fire and forget, don't block UI
  const saveOrder = useCallback(async () => {
    const moduleOrderToSave = pendingOrderRef.current
    const iconOrderToSave = pendingIconOrderRef.current

    if (!moduleOrderToSave && !iconOrderToSave) {
      console.log("[DragDrop] No pending orders to save")
      return
    }

    console.log("[DragDrop] Saving orders:", { moduleOrder: moduleOrderToSave, iconOrder: iconOrderToSave })

    // Update local state immediately (optimistic) so UI reflects new order on exit
    if (moduleOrderToSave) setModuleOrder(moduleOrderToSave)
    if (iconOrderToSave) setIconOrder(iconOrderToSave)

    // Build request body with only the orders that have changes
    const body: { moduleOrder?: Record<string, number>; iconOrder?: Record<string, number> } = {}
    if (moduleOrderToSave) body.moduleOrder = moduleOrderToSave
    if (iconOrderToSave) body.iconOrder = iconOrderToSave

    // Fire the save request in the background - don't await
    fetch("/api/modules/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to save order")
        }
        console.log("[DragDrop] Orders saved successfully")
      })
      .catch(error => {
        console.error("[DragDrop] Failed to save order:", error)
      })
  }, [])

  // Keyboard shortcut: Cmd+D to toggle drag mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "d" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        if (isDragModeRef.current) {
          saveOrder()
          setDragMode(false)
        } else {
          setIsDragMode(true)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [saveOrder, setDragMode])

  return (
    <DragDropModeContext.Provider
      value={{
        isDragMode,
        setDragMode,
        pendingOrder,
        setPendingOrder,
        pendingIconOrder,
        setPendingIconOrder,
        iconOrder,
        moduleOrder,
        saveOrder,
      }}
    >
      {children}
    </DragDropModeContext.Provider>
  )
}

export function useDragDropMode() {
  const context = useContext(DragDropModeContext)
  if (!context) {
    throw new Error("useDragDropMode must be used within a DragDropModeProvider")
  }
  return context
}
