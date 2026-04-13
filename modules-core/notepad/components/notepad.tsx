"use client"

import { useState, useEffect } from "react"
import { X, StickyNote, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { getNotepad, saveNotepad, getNotepadRevisions, restoreNotepadRevision, NotepadRevision } from "@/modules/notepad/lib/notepad"

interface NotepadProps {
  isOpen: boolean
  onClose: () => void
}

const MAX_CHARACTERS = 6000
const WARNING_THRESHOLD = 5900

export function Notepad({ isOpen, onClose }: NotepadProps) {
  const { toast } = useToast()
  const [content, setContent] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [savedContent, setSavedContent] = useState("")
  const [revisions, setRevisions] = useState<NotepadRevision[]>([])
  const [currentRevisionIndex, setCurrentRevisionIndex] = useState(-1) // -1 means viewing latest
  const [isViewingHistory, setIsViewingHistory] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [userTimezone, setUserTimezone] = useState("UTC")

  // Load user timezone preference
  useEffect(() => {
    fetch("/api/user-preferences")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.timezone) setUserTimezone(data.timezone) })
      .catch(() => {})
  }, [])

  // Load saved content and revisions from database when component mounts
  useEffect(() => {
    const loadNotepad = async () => {
      setIsLoading(true)
      try {
        const [notepad, revisionsList] = await Promise.all([
          getNotepad(),
          getNotepadRevisions()
        ])
        setContent(notepad.content || "")
        setSavedContent(notepad.content || "")
        setRevisions(revisionsList)
        setCurrentRevisionIndex(-1) // Start with latest
        setIsViewingHistory(false)
      } catch (error) {
        console.error("Failed to load notepad:", error)
        // Start with empty content if loading fails
        setContent("")
        setSavedContent("")
        setRevisions([])
      } finally {
        setIsLoading(false)
      }
    }

    if (isOpen) loadNotepad()
  }, [isOpen])

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
      // Reload revisions so the history arrows reflect the new revision
      const revisionsList = await getNotepadRevisions()
      setRevisions(revisionsList)
      setCurrentRevisionIndex(-1)
      setIsViewingHistory(false)
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

  const handleRestore = async () => {
    if (currentRevisionIndex === -1 || currentRevisionIndex >= revisions.length) {
      return
    }

    setIsSaving(true)
    try {
      const revisionToRestore = revisions[currentRevisionIndex]
      await restoreNotepadRevision(revisionToRestore.id)
      setSavedContent(revisionToRestore.content)
      setContent(revisionToRestore.content)
      setHasUnsavedChanges(false)
      // Reload revisions
      const revisionsList = await getNotepadRevisions()
      setRevisions(revisionsList)
      setCurrentRevisionIndex(-1) // Reset to latest
      setIsViewingHistory(false)
      toast({
        title: "Version restored",
        description: "The selected version has been restored.",
      })
    } catch (error) {
      console.error("Failed to restore notepad:", error)
      toast({
        title: "Error",
        description: "Failed to restore version. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const navigateToPreviousRevision = () => {
    if (revisions.length === 0) return

    if (currentRevisionIndex === -1) {
      // First time clicking previous - go to first revision (index 0)
      setCurrentRevisionIndex(0)
      setContent(revisions[0].content)
      setIsViewingHistory(true)
    } else if (currentRevisionIndex < revisions.length - 1) {
      // Go to older revision
      const newIndex = currentRevisionIndex + 1
      setCurrentRevisionIndex(newIndex)
      setContent(revisions[newIndex].content)
      setIsViewingHistory(true)
    }
  }

  const navigateToNextRevision = () => {
    if (currentRevisionIndex === -1 || revisions.length === 0) return

    if (currentRevisionIndex > 0) {
      // Go to newer revision
      const newIndex = currentRevisionIndex - 1
      setCurrentRevisionIndex(newIndex)
      setContent(revisions[newIndex].content)
      setIsViewingHistory(true)
    } else if (currentRevisionIndex === 0) {
      // We're at the newest revision, go back to latest
      setCurrentRevisionIndex(-1)
      setContent(savedContent)
      setIsViewingHistory(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true)
      return
    }
    onClose()
  }

  const handleDiscardAndClose = () => {
    setContent(savedContent)
    setHasUnsavedChanges(false)
    setShowUnsavedDialog(false)
    onClose()
  }

  const handleSaveFromDialog = async () => {
    setIsSaving(true)
    try {
      await saveNotepad(content)
      setSavedContent(content)
      setHasUnsavedChanges(false)
      const revisionsList = await getNotepadRevisions()
      setRevisions(revisionsList)
      setCurrentRevisionIndex(-1)
      setIsViewingHistory(false)
      setShowUnsavedDialog(false)
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

  const charactersLeft = MAX_CHARACTERS - content.length
  const showWarning = content.length >= WARNING_THRESHOLD
  const canGoBack = revisions.length > 0 && (currentRevisionIndex === -1 || currentRevisionIndex < revisions.length - 1)
  const canGoForward = currentRevisionIndex > -1

  const getVersionLabel = () => {
    if (currentRevisionIndex === -1) {
      return "Latest Version"
    }
    const revision = revisions[currentRevisionIndex]
    const d = new Date(revision.created_at)
    const date = d.toLocaleDateString(undefined, { timeZone: userTimezone, month: 'numeric', day: 'numeric', year: 'numeric' })
    const time = d.toLocaleTimeString(undefined, { timeZone: userTimezone, hour: 'numeric', minute: '2-digit' })
    return `${date} ${time}`
  }

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
      <div
        className={`fixed bg-background text-foreground z-[101] transform transition-all duration-300 ease-in-out overflow-hidden ${
          isFullscreen
            ? "inset-4 w-auto h-auto"
            : "top-0 right-0 h-full w-[500px] shadow-2xl"
        } ${
          isOpen ? (isFullscreen ? "opacity-100 scale-100" : "translate-x-0") : (isFullscreen ? "opacity-0 scale-95 pointer-events-none" : "translate-x-full")
        }`}
        style={isFullscreen ? {
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          borderRadius: '15px',
        } : undefined}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Notepad</h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateToPreviousRevision}
                disabled={!canGoBack || isLoading}
                className="h-8 w-8"
                title="Previous version"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateToNextRevision}
                disabled={!canGoForward || isLoading}
                className="h-8 w-8"
                title="Next version"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5" />
                ) : (
                  <Maximize2 className="w-5 h-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="px-6 py-4 bg-muted border-b border-border">
            <p className="text-sm text-muted-foreground">
              {isViewingHistory
                ? `Viewing previous version. Click "Restore" to make this your current version.`
                : "Welcome to your notepad. Use this area to jot down tasks, notes, ideas, reminders, or anything really. Don't forget to press save when you're done!"
              }
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
              disabled={isLoading || isViewingHistory}
              maxLength={MAX_CHARACTERS}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 p-6 border-t border-border bg-muted">
            <div className="text-sm">
              {isViewingHistory && (
                <span className="font-medium text-muted-foreground">
                  {getVersionLabel()}
                </span>
              )}
              {!isViewingHistory && showWarning && (
                <span className="text-destructive font-medium">
                  {charactersLeft} characters left
                </span>
              )}
              {!isViewingHistory && !showWarning && hasUnsavedChanges && (
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
              {isViewingHistory ? (
                <Button
                  onClick={handleRestore}
                  className="min-w-[100px] bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isSaving}
                >
                  {isSaving ? "Restoring..." : "Restore"}
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  className="min-w-[100px] bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!hasUnsavedChanges || isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your notepad. Save before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleDiscardAndClose}
              disabled={isSaving}
            >
              Discard
            </Button>
            <AlertDialogAction onClick={handleSaveFromDialog} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
