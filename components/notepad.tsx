"use client"

import { useState, useEffect } from "react"
import { X, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { getNotepad, saveNotepad } from "@/lib/notepad"

interface NotepadProps {
  isOpen: boolean
  onClose: () => void
}

const MAX_CHARACTERS = 2250
const WARNING_THRESHOLD = 2150

export function Notepad({ isOpen, onClose }: NotepadProps) {
  const { toast } = useToast()
  const [content, setContent] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [savedContent, setSavedContent] = useState("")

  // Load saved content from database when component mounts
  useEffect(() => {
    const loadNotepad = async () => {
      setIsLoading(true)
      try {
        const notepad = await getNotepad()
        setContent(notepad.content || "")
        setSavedContent(notepad.content || "")
      } catch (error) {
        console.error("Failed to load notepad:", error)
        // Start with empty content if loading fails
        setContent("")
        setSavedContent("")
      } finally {
        setIsLoading(false)
      }
    }

    loadNotepad()
  }, [])

  // Track changes
  useEffect(() => {
    setHasUnsavedChanges(content !== savedContent)
  }, [content, savedContent])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    if (newContent.length <= MAX_CHARACTERS) {
      setContent(newContent)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveNotepad(content)
      setSavedContent(content)
      setHasUnsavedChanges(false)
      toast({
        title: "Notepad saved",
        description: "Your notes have been saved successfully.",
      })
    } catch (error) {
      console.error("Failed to save notepad:", error)
      toast({
        title: "Error",
        description: "Failed to save notepad. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm("You have unsaved changes. Are you sure you want to close?")
      if (!confirmClose) return
    }
    onClose()
  }

  const charactersLeft = MAX_CHARACTERS - content.length
  const showWarning = content.length >= WARNING_THRESHOLD

  return (
    <>
      {/* Backdrop - only show when open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-[100]"
          onClick={handleClose}
        />
      )}

      {/* Sliding Panel - always rendered but off-screen when closed */}
      <div className={`fixed top-0 right-0 h-full w-[500px] bg-white shadow-2xl z-[101] transform transition-transform duration-300 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Notepad</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Instructions */}
          <div className="px-6 py-4 bg-gray-50 border-b">
            <p className="text-sm text-gray-600">
              Welcome to your notepad. Use this area to jot down tasks, notes, ideas, reminders, or anything really. Don't forget to press save when you're done!
            </p>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 overflow-y-auto">
            <Textarea
              value={content}
              onChange={handleContentChange}
              placeholder="Start typing here..."
              className="w-full h-full min-h-[400px] resize-none border-0 focus:ring-0 p-0 text-base"
              style={{ outline: 'none' }}
              disabled={isLoading}
              maxLength={MAX_CHARACTERS}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 p-6 border-t bg-gray-50">
            <div className="text-sm">
              {showWarning && (
                <span className="text-red-600 font-medium">
                  {charactersLeft} characters left
                </span>
              )}
              {!showWarning && hasUnsavedChanges && (
                <span className="text-amber-600">• Unsaved changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="min-w-[100px]"
              >
                Close
              </Button>
              <Button
                onClick={handleSave}
                className="min-w-[100px] bg-blue-600 hover:bg-blue-700"
                disabled={!hasUnsavedChanges || isSaving}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}