"use client"

import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Task {
  id: string
  title: string
  status: string
  priority_score?: number
  due_date?: string
  impact?: number
  severity?: number
  timeliness?: number
  effort?: number
  strategic_fit?: number
  pinned?: boolean
  completed: boolean
}

interface HDCardZoomModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  cardType: 'pinned' | 'active' | 'overdue' | 'priority' | 'notepad'
  tasks?: Task[]
  notepadContent?: string
}

// Urgency color function (copied from HD Dashboard)
function getUrgencyColor(dueDate: string | undefined): string {
  if (!dueDate) return "bg-gray-100 dark:bg-gray-700 blueprint:bg-white/10 light:bg-gray-100 text-gray-700 dark:text-gray-300 blueprint:text-white light:text-gray-700"

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilDue < 0) {
    return "bg-red-100 dark:bg-red-900/50 blueprint:bg-red-500/20 light:bg-red-100 text-red-700 dark:text-red-300 blueprint:text-red-200 light:text-red-700"
  } else if (daysUntilDue <= 1) {
    return "bg-orange-100 dark:bg-orange-900/50 blueprint:bg-orange-500/20 light:bg-orange-100 text-orange-700 dark:text-orange-300 blueprint:text-orange-200 light:text-orange-700"
  } else if (daysUntilDue <= 3) {
    return "bg-yellow-100 dark:bg-yellow-900/50 blueprint:bg-yellow-500/20 light:bg-yellow-100 text-yellow-700 dark:text-yellow-300 blueprint:text-yellow-200 light:text-yellow-700"
  } else {
    return "bg-green-100 dark:bg-green-900/50 blueprint:bg-green-500/20 light:bg-green-100 text-green-700 dark:text-green-300 blueprint:text-green-200 light:text-green-700"
  }
}

export function HDCardZoomModal({
  isOpen,
  onClose,
  title,
  cardType,
  tasks = [],
  notepadContent = ""
}: HDCardZoomModalProps) {

  // Determine card-specific background color
  const getCardBg = () => {
    switch(cardType) {
      case 'pinned':
        return "bg-blue-50 dark:bg-blue-900/20 blueprint:bg-transparent light:bg-blue-50"
      case 'active':
        return "bg-gray-50 dark:bg-gray-800/50 blueprint:bg-transparent light:bg-gray-50"
      case 'overdue':
        return "bg-red-50 dark:bg-red-900/20 blueprint:bg-transparent light:bg-red-50"
      case 'priority':
        return "bg-orange-50 dark:bg-orange-900/20 blueprint:bg-transparent light:bg-orange-50"
      case 'notepad':
        return "bg-yellow-50 dark:bg-yellow-900/20 blueprint:bg-transparent light:bg-yellow-50"
      default:
        return "bg-white dark:bg-gray-900 blueprint:bg-[#056baa] light:bg-white"
    }
  }

  const renderContent = () => {
    if (cardType === 'notepad') {
      return (
        <div className={`${getCardBg()} p-6 rounded-lg overflow-y-auto max-h-[calc(70vh-120px)]`}>
          <div className="text-gray-700 dark:text-gray-300 blueprint:text-white light:text-gray-700 whitespace-pre-wrap font-mono">
            {notepadContent || "No notes yet"}
          </div>
        </div>
      )
    }

    if (cardType === 'priority') {
      return (
        <div className={`${getCardBg()} p-6 rounded-lg overflow-y-auto max-h-[calc(70vh-120px)]`}>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 blueprint:text-white/60 light:text-gray-500 text-sm">
                No priority tasks
              </p>
            ) : (
              tasks.map((task, index) => (
                <div
                  key={task.id}
                  className="p-3 rounded bg-white dark:bg-gray-800 blueprint:bg-white/5 light:bg-white border border-gray-200 dark:border-gray-700 blueprint:border-white/10 light:border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <span className="font-bold text-gray-900 dark:text-white blueprint:text-white light:text-gray-900 min-w-[2rem]">
                      {index + 1}.
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white blueprint:text-white light:text-gray-900 mb-1">
                        {task.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {task.due_date && (
                          <span className={`px-2 py-0.5 rounded ${getUrgencyColor(task.due_date)}`}>
                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 blueprint:bg-purple-500/20 light:bg-purple-100 text-purple-700 dark:text-purple-300 blueprint:text-purple-200 light:text-purple-700">
                          P: {task.priority_score?.toFixed(1)}
                        </span>
                        {task.impact !== undefined && (
                          <span className="text-gray-600 dark:text-gray-400 blueprint:text-white/70 light:text-gray-600">
                            I:{task.impact}
                          </span>
                        )}
                        {task.severity !== undefined && (
                          <span className="text-gray-600 dark:text-gray-400 blueprint:text-white/70 light:text-gray-600">
                            S:{task.severity}
                          </span>
                        )}
                        {task.effort !== undefined && (
                          <span className="text-gray-600 dark:text-gray-400 blueprint:text-white/70 light:text-gray-600">
                            E:{task.effort}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )
    }

    if (cardType === 'overdue') {
      return (
        <div className={`${getCardBg()} p-6 rounded-lg overflow-y-auto max-h-[calc(70vh-120px)]`}>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 blueprint:text-white/60 light:text-gray-500 text-sm">
                No overdue tasks
              </p>
            ) : (
              tasks.map(task => (
                <div
                  key={task.id}
                  className="p-3 rounded bg-white dark:bg-gray-800 blueprint:bg-white/5 light:bg-white border border-gray-200 dark:border-gray-700 blueprint:border-white/10 light:border-gray-200"
                >
                  <div className="font-medium text-gray-900 dark:text-white blueprint:text-white light:text-gray-900 mb-1">
                    {task.title}
                  </div>
                  {task.due_date && (
                    <div className="text-sm text-red-600 dark:text-red-400 blueprint:text-red-300 light:text-red-600">
                      Due: {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )
    }

    // For pinned and active tasks
    return (
      <div className={`${getCardBg()} p-6 rounded-lg overflow-y-auto max-h-[calc(70vh-120px)]`}>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 blueprint:text-white/60 light:text-gray-500 text-sm">
              No tasks
            </p>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                className="p-3 rounded bg-white dark:bg-gray-800 blueprint:bg-white/5 light:bg-white border border-gray-200 dark:border-gray-700 blueprint:border-white/10 light:border-gray-200"
              >
                <div className="font-medium text-gray-900 dark:text-white blueprint:text-white light:text-gray-900 mb-1">
                  {task.title}
                </div>
                {task.due_date && (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${getUrgencyColor(task.due_date)}`}>
                    {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[70vw] max-h-[70vh] bg-white dark:bg-gray-900 blueprint:bg-[#056baa] light:bg-white border-gray-200 dark:border-gray-700 blueprint:border-white/20 light:border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white blueprint:text-white light:text-gray-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  )
}
