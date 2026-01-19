"use client"

import * as React from "react"
import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"

interface DragDropModeContextType {
  isDragMode: boolean
  setDragMode: (mode: boolean) => void
  pendingOrder: Record<string, number> | null
  setPendingOrder: (order: Record<string, number> | null) => void
  saveOrder: () => Promise<void>
}

const DragDropModeContext = createContext<DragDropModeContextType | null>(null)

export function DragDropModeProvider({ children }: { children: React.ReactNode }) {
  const [isDragMode, setIsDragMode] = useState(false)
  const [pendingOrder, setPendingOrder] = useState<Record<string, number> | null>(null)

  // Use ref to access pendingOrder in saveOrder without stale closure
  const pendingOrderRef = useRef<Record<string, number> | null>(null)
  pendingOrderRef.current = pendingOrder

  // Keyboard shortcut: Cmd+D to toggle drag mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "d" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setIsDragMode(prev => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const setDragMode = useCallback((mode: boolean) => {
    setIsDragMode(mode)
    // Reset pending order when exiting drag mode
    if (!mode) {
      setPendingOrder(null)
    }
  }, [])

  // Optimistic save - fire and forget, don't block UI
  const saveOrder = useCallback(async () => {
    const orderToSave = pendingOrderRef.current
    if (!orderToSave) {
      console.log("[DragDrop] No pending order to save")
      return
    }

    console.log("[DragDrop] Saving order:", orderToSave)

    // Fire the save request in the background - don't await
    fetch("/api/modules/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleOrder: orderToSave }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to save module order")
        }
        console.log("[DragDrop] Order saved successfully")
      })
      .catch(error => {
        console.error("[DragDrop] Failed to save module order:", error)
        // Could show a toast notification here on error
      })
  }, [])

  return (
    <DragDropModeContext.Provider
      value={{
        isDragMode,
        setDragMode,
        pendingOrder,
        setPendingOrder,
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
