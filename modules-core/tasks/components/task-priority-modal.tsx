"use client"

import { useState } from "react"
import { Task } from "@/lib/supabase"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { calculatePriorityScore, getTaskPriorityLevel } from "../lib/priority-utils"
import { Info } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TaskPriorityModalProps {
  task: Task
  isOpen: boolean
  onClose: () => void
  onUpdate: (taskId: string, axes: {
    impact: number
    severity: number
    timeliness: number
    effort: number
    strategic_fit: number
  }) => Promise<void>
}

const axisDescriptions = {
  impact: "How much this task affects your goals and objectives",
  severity: "How critical or severe the problem/opportunity is",
  timeliness: "How urgent this task is based on deadlines",
  effort: "Amount of resources/time needed (lower is better)",
  strategic_fit: "How well this aligns with your strategic priorities"
}

export function TaskPriorityModal({
  task,
  isOpen,
  onClose,
  onUpdate
}: TaskPriorityModalProps) {
  const [axes, setAxes] = useState({
    impact: task.impact || 3,
    severity: task.severity || 3,
    timeliness: task.timeliness || 3,
    effort: task.effort || 3,
    strategic_fit: task.strategic_fit || 3
  })
  const [isSaving, setIsSaving] = useState(false)

  const currentScore = calculatePriorityScore(axes)
  const priorityLevel = getTaskPriorityLevel(currentScore)

  const handleAxisChange = (axis: keyof typeof axes, value: number[]) => {
    setAxes(prev => ({
      ...prev,
      [axis]: value[0]
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate(task.id, axes)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setAxes({
      impact: 3,
      severity: 3,
      timeliness: 3,
      effort: 3,
      strategic_fit: 3
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Task Priority</DialogTitle>
          <DialogDescription>
            Adjust the priority factors for: <span className="font-medium">{task.title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Priority Score */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium">Priority Score</p>
              <p className="text-xs text-muted-foreground">Higher score = higher priority</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{currentScore.toFixed(1)}</span>
              <Badge variant={
                priorityLevel === 'critical' ? 'destructive' :
                priorityLevel === 'high' ? 'default' :
                priorityLevel === 'medium' ? 'secondary' :
                'outline'
              }>
                {priorityLevel}
              </Badge>
            </div>
          </div>

          {/* Axis Sliders */}
          <div className="space-y-4">
            {Object.entries(axes).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={key} className="capitalize">
                      {key.replace('_', ' ')}
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            {axisDescriptions[key as keyof typeof axisDescriptions]}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{value}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-8">Low</span>
                  <Slider
                    id={key}
                    value={[value]}
                    onValueChange={(val) => handleAxisChange(key as keyof typeof axes, val)}
                    min={1}
                    max={5}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-8">High</span>
                </div>
                {key === 'effort' && (
                  <p className="text-xs text-muted-foreground italic">
                    Note: Lower effort = higher priority
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Visual Indicator */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700">
              <strong>Tip:</strong> Tasks with high impact, severity, and timeliness but low effort
              will have higher priority scores and appear closer to the center of the radar chart.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSaving}
          >
            Reset to Defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
