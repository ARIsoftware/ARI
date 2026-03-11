"use client"

import { useState, useEffect } from "react"
import { X, Calendar, Flag, Skull, ChevronLeft, ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { Task } from "@/lib/supabase"
import { MONSTER_INFO, type MonsterType } from "../lib/monster-utils"
import { useSupabase } from "@/components/providers"

interface TaskWithMonster extends Task {
  monster_type: string
  monster_colors: { primary: string; secondary: string }
}

interface TaskMonsterPopupProps {
  task: TaskWithMonster | null
  tasks: TaskWithMonster[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export default function TaskMonsterPopup({ task, tasks, currentIndex, onClose, onNavigate }: TaskMonsterPopupProps) {
  const { session } = useSupabase()
  const [isDestroying, setIsDestroying] = useState(false)

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < tasks.length - 1

  // Keyboard navigation
  useEffect(() => {
    if (!task || isDestroying) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && canGoPrev) {
        onNavigate(currentIndex - 1)
      } else if (e.key === "ArrowRight" && canGoNext) {
        onNavigate(currentIndex + 1)
      } else if (e.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [task, isDestroying, canGoPrev, canGoNext, currentIndex, onNavigate, onClose])

  if (!task) return null

  const monsterInfo = MONSTER_INFO[task.monster_type as MonsterType]
  const priorityColors = {
    Low: "bg-green-500/20 text-green-400",
    Medium: "bg-yellow-500/20 text-yellow-400",
    High: "bg-red-500/20 text-red-400",
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleDestroy = async () => {
    if (!session?.access_token || isDestroying) return

    // Start the fade animation
    setIsDestroying(true)

    // Mark task as complete in the background
    try {
      await fetch('/api/modules/tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: task.id,
          updates: {
            completed: true,
            status: 'Completed',
          },
        }),
      })
    } catch (err) {
      console.error('Failed to complete task:', err)
    }

    // After 1 second animation, reload the page
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={isDestroying ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Navigation arrows - outside the card */}
      {!isDestroying && tasks.length > 1 && (
        <>
          {/* Left arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (canGoPrev) onNavigate(currentIndex - 1)
            }}
            disabled={!canGoPrev}
            className={`absolute left-4 md:left-8 z-20 p-3 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-lg transition-all ${
              canGoPrev
                ? "hover:bg-card hover:scale-110 cursor-pointer"
                : "opacity-30 cursor-not-allowed"
            }`}
          >
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </button>

          {/* Right arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (canGoNext) onNavigate(currentIndex + 1)
            }}
            disabled={!canGoNext}
            className={`absolute right-4 md:right-8 z-20 p-3 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-lg transition-all ${
              canGoNext
                ? "hover:bg-card hover:scale-110 cursor-pointer"
                : "opacity-30 cursor-not-allowed"
            }`}
          >
            <ChevronRight className="w-6 h-6 text-foreground" />
          </button>
        </>
      )}

      <div
        className="relative bg-card rounded-2xl shadow-2xl max-w-2xl w-full flex overflow-hidden border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - hidden during destroy */}
        {!isDestroying && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors z-10"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        )}

        {/* Left side - Monster display */}
        <div
          className="w-2/5 p-8 flex flex-col items-center justify-center"
          style={{ backgroundColor: `${task.monster_colors.primary}20` }}
        >
          {/* Stable container to prevent layout shift */}
          <div className="relative w-32 h-32 mb-4">
            <AnimatePresence>
              {!isDestroying && (
                <motion.div
                  key="monster"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ rotate: 0, scale: 1 }}
                  exit={{
                    rotate: 720,
                    scale: 0,
                    transition: { duration: 1, ease: "easeInOut" }
                  }}
                >
                  <MonsterIllustration
                    type={task.monster_type as MonsterType}
                    primary={task.monster_colors.primary}
                    secondary={task.monster_colors.secondary}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {!isDestroying && (
              <motion.div
                key="badge"
                className="px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: task.monster_colors.primary }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.3, ease: "easeOut" }
                }}
              >
                {task.monster_type.toUpperCase()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side - Task info */}
        <div className="w-3/5 p-8 flex flex-col justify-between">
          <motion.div
            animate={{ opacity: isDestroying ? 0.5 : 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Task Title */}
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {task.title}
            </h2>

            {/* Task metadata */}
            <div className="flex flex-wrap gap-2 mb-4">
              {task.due_date && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  <Calendar className="w-3 h-3" />
                  {formatDate(task.due_date)}
                </div>
              )}
              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${priorityColors[task.priority]}`}>
                <Flag className="w-3 h-3" />
                {task.priority}
              </div>
            </div>

            {/* Monster lore */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">About this {monsterInfo?.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{monsterInfo?.description}</p>
            </div>
          </motion.div>

          {/* Destroy button */}
          <div className="mt-6">
            <button
              onClick={handleDestroy}
              disabled={isDestroying}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
                isDestroying
                  ? "bg-green-600 text-white cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <Skull className="w-5 h-5" />
              {isDestroying ? "Task Complete" : "Destroy"}
            </button>
          </div>

          {/* Color indicators and page counter */}
          <motion.div
            className="mt-4 flex items-center justify-between"
            animate={{ opacity: isDestroying ? 0.5 : 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.monster_colors.primary }} />
                <span className="text-xs text-muted-foreground">Primary</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: task.monster_colors.secondary }} />
                <span className="text-xs text-muted-foreground">Secondary</span>
              </div>
            </div>
            {tasks.length > 1 && (
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} / {tasks.length}
              </span>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// Simple SVG illustrations for each monster type
function MonsterIllustration({ type, primary, secondary }: { type: MonsterType; primary: string; secondary: string }) {
  switch (type) {
    case "slime":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <ellipse cx="50" cy="60" rx="35" ry="30" fill={primary} opacity="0.85" />
          <circle cx="40" cy="50" r="8" fill="white" />
          <circle cx="60" cy="50" r="8" fill="white" />
          <circle cx="42" cy="52" r="4" fill="#1a1a1a" />
          <circle cx="62" cy="52" r="4" fill="#1a1a1a" />
          <rect x="42" y="68" width="16" height="4" rx="2" fill={secondary} />
        </svg>
      )
    case "cyclops":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="30" y="45" width="40" height="45" rx="4" fill={primary} />
          <rect x="28" y="20" width="44" height="35" rx="4" fill={primary} />
          <circle cx="50" cy="38" r="14" fill="#ffffee" />
          <circle cx="50" cy="38" r="8" fill="#ff3333" />
          <circle cx="50" cy="38" r="4" fill="#1a1a1a" />
          <polygon points="35,22 30,8 38,18" fill={secondary} />
          <polygon points="65,22 70,8 62,18" fill={secondary} />
          <rect x="35" y="85" width="12" height="15" rx="2" fill={secondary} />
          <rect x="53" y="85" width="12" height="15" rx="2" fill={secondary} />
        </svg>
      )
    case "ghost":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <path
            d="M50 15 C25 15 20 40 20 60 L20 90 L30 80 L40 90 L50 80 L60 90 L70 80 L80 90 L80 60 C80 40 75 15 50 15Z"
            fill={primary}
            opacity="0.7"
          />
          <circle cx="38" cy="45" r="8" fill="#1a1a1a" />
          <circle cx="62" cy="45" r="8" fill="#1a1a1a" />
          <ellipse cx="50" cy="65" rx="6" ry="8" fill={secondary} />
        </svg>
      )
    case "goblin":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="35" y="50" width="30" height="30" rx="3" fill={primary} />
          <rect x="32" y="25" width="36" height="30" rx="3" fill={primary} />
          <polygon points="20,35 32,28 32,42" fill={primary} />
          <polygon points="80,35 68,28 68,42" fill={primary} />
          <rect x="38" y="38" width="8" height="5" fill="#ffff00" />
          <rect x="54" y="38" width="8" height="5" fill="#ffff00" />
          <rect x="44" y="48" width="12" height="8" rx="2" fill={secondary} />
          <rect x="30" y="55" width="8" height="25" rx="2" fill={primary} />
          <rect x="62" y="55" width="8" height="25" rx="2" fill={primary} />
          <rect x="38" y="78" width="10" height="18" rx="2" fill={secondary} />
          <rect x="52" y="78" width="10" height="18" rx="2" fill={secondary} />
        </svg>
      )
    case "spider":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <ellipse cx="50" cy="55" rx="22" ry="18" fill={primary} />
          <circle cx="50" cy="35" r="14" fill={primary} />
          {[...Array(6)].map((_, i) => (
            <circle key={i} cx={40 + (i % 3) * 10} cy={30 + Math.floor(i / 3) * 8} r="3" fill={secondary} />
          ))}
          {[-40, -25, 25, 40].map((angle, i) => (
            <line
              key={i}
              x1="50"
              y1="55"
              x2={50 + Math.cos((angle * Math.PI) / 180) * 35}
              y2={55 + Math.sin((angle * Math.PI) / 180) * 25}
              stroke={secondary}
              strokeWidth="4"
            />
          ))}
          {[-140, -155, 155, 140].map((angle, i) => (
            <line
              key={i + 4}
              x1="50"
              y1="55"
              x2={50 + Math.cos((angle * Math.PI) / 180) * 35}
              y2={55 + Math.sin((angle * Math.PI) / 180) * 25}
              stroke={secondary}
              strokeWidth="4"
            />
          ))}
        </svg>
      )
    case "mushroom":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="40" y="55" width="20" height="35" rx="4" fill="#f5f5dc" />
          <ellipse cx="50" cy="45" rx="35" ry="25" fill={primary} />
          <circle cx="40" cy="40" r="6" fill={secondary} />
          <circle cx="60" cy="35" r="5" fill={secondary} />
          <circle cx="50" cy="50" r="4" fill={secondary} />
          <circle cx="45" cy="70" r="3" fill="#1a1a1a" />
          <circle cx="55" cy="70" r="3" fill="#1a1a1a" />
        </svg>
      )
    case "dragon":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Body */}
          <ellipse cx="50" cy="55" rx="22" ry="18" fill={primary} />
          {/* Head */}
          <ellipse cx="50" cy="32" rx="16" ry="14" fill={primary} />
          {/* Snout */}
          <ellipse cx="50" cy="40" rx="10" ry="6" fill={primary} />
          {/* Eyes */}
          <circle cx="43" cy="28" r="5" fill="white" />
          <circle cx="57" cy="28" r="5" fill="white" />
          <circle cx="44" cy="29" r="2.5" fill="#1a1a1a" />
          <circle cx="58" cy="29" r="2.5" fill="#1a1a1a" />
          {/* Nostrils */}
          <circle cx="46" cy="42" r="2" fill="#1a1a1a" />
          <circle cx="54" cy="42" r="2" fill="#1a1a1a" />
          {/* Small horns */}
          <polygon points="38,20 35,8 42,16" fill={secondary} />
          <polygon points="62,20 65,8 58,16" fill={secondary} />
          {/* Wings */}
          <ellipse cx="25" cy="50" rx="12" ry="18" fill={secondary} opacity="0.9" />
          <ellipse cx="75" cy="50" rx="12" ry="18" fill={secondary} opacity="0.9" />
          {/* Tail */}
          <path d="M 68 60 Q 85 65 90 55 Q 95 45 88 42" stroke={primary} strokeWidth="8" fill="none" strokeLinecap="round" />
          <polygon points="88,38 95,42 88,48" fill={secondary} />
          {/* Legs */}
          <rect x="35" y="68" width="10" height="14" rx="3" fill={primary} />
          <rect x="55" y="68" width="10" height="14" rx="3" fill={primary} />
        </svg>
      )
    case "blob":
      return (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <ellipse cx="50" cy="65" rx="35" ry="25" fill={primary} />
          <circle cx="35" cy="50" r="10" fill={primary} />
          <circle cx="65" cy="45" r="8" fill={primary} />
          <line x1="40" y1="45" x2="40" y2="30" stroke={primary} strokeWidth="4" />
          <line x1="60" y1="42" x2="62" y2="28" stroke={primary} strokeWidth="4" />
          <circle cx="40" cy="28" r="6" fill="white" />
          <circle cx="62" cy="26" r="6" fill="white" />
          <circle cx="41" cy="29" r="3" fill="#1a1a1a" />
          <circle cx="63" cy="27" r="3" fill="#1a1a1a" />
        </svg>
      )
    default:
      return null
  }
}
