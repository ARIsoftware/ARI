"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  Palette,
  Type,
  Plus,
  Trash2,
  Download,
  Upload,
  Check,
  Copy,
  Sun,
  Moon,
} from "lucide-react"
import { useTheme, THEME_PRESETS, FONTS } from "@/lib/theme/theme-context"
import { ThemeColorEditor, hslToHex } from "@/components/theme-color-editor"
import type { ThemeColors, CustomTheme, ThemeCategory } from "@/lib/theme/types"
import { getThemeById } from "@/lib/theme/presets"

// Generate unique ID
function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Default colors for new custom theme (copy from pastel)
const DEFAULT_CUSTOM_COLORS: ThemeColors = THEME_PRESETS[0].colors

export function ThemesTab(): React.ReactElement {
  const {
    activeThemeId,
    activeFont,
    customThemes,
    setTheme,
    setFont,
    addCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
  } = useTheme()

  // State for custom theme editor
  const [isCreating, setIsCreating] = useState(false)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null)
  const [newThemeName, setNewThemeName] = useState("")
  const [newThemeCategory, setNewThemeCategory] = useState<ThemeCategory>("dark")
  const [newThemeColors, setNewThemeColors] = useState<ThemeColors>(DEFAULT_CUSTOM_COLORS)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Start creating a new theme
  const handleStartCreate = useCallback(() => {
    setIsCreating(true)
    setEditingTheme(null)
    setNewThemeName("")
    setNewThemeCategory("dark")
    setNewThemeColors(DEFAULT_CUSTOM_COLORS)
  }, [])

  // Start editing an existing custom theme
  const handleStartEdit = useCallback((theme: CustomTheme) => {
    setIsCreating(false)
    setEditingTheme(theme)
    setNewThemeName(theme.name)
    setNewThemeCategory(theme.category)
    setNewThemeColors(theme.colors)
  }, [])

  // Save the theme (create or update)
  const handleSaveTheme = useCallback(() => {
    if (!newThemeName.trim()) return

    const now = new Date().toISOString()

    if (editingTheme) {
      // Update existing
      const updated: CustomTheme = {
        ...editingTheme,
        name: newThemeName.trim(),
        category: newThemeCategory,
        colors: newThemeColors,
        updatedAt: now,
      }
      updateCustomTheme(updated)
      setEditingTheme(null)
    } else {
      // Create new
      const newTheme: CustomTheme = {
        id: generateId(),
        name: newThemeName.trim(),
        category: newThemeCategory,
        colors: newThemeColors,
        createdAt: now,
        updatedAt: now,
      }
      addCustomTheme(newTheme)
      setIsCreating(false)
    }
  }, [
    newThemeName,
    newThemeCategory,
    newThemeColors,
    editingTheme,
    addCustomTheme,
    updateCustomTheme,
  ])

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setIsCreating(false)
    setEditingTheme(null)
    setNewThemeName("")
    setNewThemeColors(DEFAULT_CUSTOM_COLORS)
  }, [])

  // Delete a custom theme
  const handleDeleteTheme = useCallback(
    (themeId: string) => {
      deleteCustomTheme(themeId)
      setDeleteConfirmId(null)
    },
    [deleteCustomTheme]
  )

  // Export theme as JSON
  const handleExportTheme = useCallback((theme: CustomTheme) => {
    const data = JSON.stringify(theme, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, "-")}-theme.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  // Import theme from JSON file
  const handleImportTheme = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setImportError(null)

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)

          // Validate required fields
          if (!data.name || !data.category || !data.colors) {
            throw new Error("Invalid theme file: missing required fields")
          }

          // Create new theme with fresh ID
          const now = new Date().toISOString()
          const importedTheme: CustomTheme = {
            id: generateId(),
            name: data.name,
            category: data.category,
            colors: data.colors,
            createdAt: now,
            updatedAt: now,
          }

          addCustomTheme(importedTheme)
        } catch (error) {
          setImportError(
            error instanceof Error ? error.message : "Failed to import theme"
          )
        }
      }
      reader.readAsText(file)

      // Reset input
      event.target.value = ""
    },
    [addCustomTheme]
  )

  // Copy theme from preset
  const handleCopyPreset = useCallback((presetId: string) => {
    const preset = getThemeById(presetId)
    if (!preset) return

    setIsCreating(true)
    setEditingTheme(null)
    setNewThemeName(`${preset.name} Copy`)
    setNewThemeCategory(preset.category)
    setNewThemeColors({ ...preset.colors })
  }, [])

  // Get preview colors for a theme
  const getPreviewColors = (colors: ThemeColors) => ({
    background: `hsl(${colors.background})`,
    primary: `hsl(${colors.primary})`,
    accent: `hsl(${colors.accent})`,
  })

  return (
    <div className="space-y-6">
      {/* Theme Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-5 w-5 text-indigo-500" />
            Theme Selection
          </CardTitle>
          <CardDescription>
            Choose from pre-built themes or create your own custom theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {THEME_PRESETS.map((theme) => {
              const preview = getPreviewColors(theme.colors)
              const isActive = activeThemeId === theme.id

              return (
                <button
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  className={`relative p-3 rounded-lg border-2 transition-all hover:scale-105 ${
                    isActive
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  style={{ backgroundColor: preview.background }}
                >
                  {/* Theme preview */}
                  <div className="flex items-center gap-1 mb-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: preview.primary }}
                    />
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: preview.accent }}
                    />
                    {theme.category === "dark" ? (
                      <Moon className="w-3 h-3 ml-auto text-gray-400" />
                    ) : (
                      <Sun className="w-3 h-3 ml-auto text-gray-600" />
                    )}
                  </div>
                  <span
                    className="text-xs font-medium truncate block"
                    style={{ color: `hsl(${theme.colors.foreground})` }}
                  >
                    {theme.name}
                  </span>
                  {isActive && (
                    <div className="absolute top-1 right-1">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  {/* Copy button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyPreset(theme.id)
                    }}
                    className="absolute bottom-1 right-1 p-1 rounded hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy as custom theme"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Themes Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-purple-500" />
              Custom Themes
            </span>
            <Button size="sm" onClick={handleStartCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Theme
            </Button>
          </CardTitle>
          <CardDescription>
            Create and manage your own custom themes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customThemes.length === 0 && !isCreating && !editingTheme ? (
            <div className="text-center py-8 text-muted-foreground">
              <Palette className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No custom themes yet.</p>
              <p className="text-sm">
                Click "New Theme" to create your first custom theme.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {customThemes.map((theme) => {
                const preview = getPreviewColors(theme.colors)
                const isActive = activeThemeId === theme.id

                return (
                  <div
                    key={theme.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isActive ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    {/* Preview colors */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center gap-1"
                      style={{ backgroundColor: preview.background }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: preview.primary }}
                      />
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: preview.accent }}
                      />
                    </div>

                    {/* Theme info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{theme.name}</span>
                        {theme.category === "dark" ? (
                          <Moon className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <Sun className="w-3 h-3 text-muted-foreground" />
                        )}
                        {isActive && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Updated{" "}
                        {new Date(theme.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(theme.id)}
                        disabled={isActive}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(theme)}
                      >
                        <Palette className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleExportTheme(theme)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirmId(theme.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t bg-muted/60 flex justify-between items-center pt-4">
          <div className="text-sm text-muted-foreground">
            Import a theme from a JSON file
          </div>
          <label>
            <input
              type="file"
              accept=".json"
              onChange={handleImportTheme}
              className="hidden"
            />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                Import Theme
              </span>
            </Button>
          </label>
        </CardFooter>
      </Card>

      {/* Import error message */}
      {importError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-4 text-sm text-destructive">
          {importError}
        </div>
      )}

      {/* Theme Editor Card (shown when creating or editing) */}
      {(isCreating || editingTheme) && (
        <Card>
          <CardHeader className="pb-6">
            <CardTitle className="text-xl">
              {editingTheme ? `Editing "${editingTheme.name}"` : "Create New Theme"}
            </CardTitle>
            <CardDescription className="text-base">
              Customize your theme colors. Changes are previewed in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Theme name and category - larger, more spacious */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="theme-name" className="text-sm font-medium">
                  Theme Name
                </Label>
                <Input
                  id="theme-name"
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  placeholder="My Custom Theme"
                  className="h-12 text-base px-4"
                />
                <p className="text-xs text-muted-foreground">
                  Choose a memorable name for your theme
                </p>
              </div>
              <div className="space-y-3">
                <Label htmlFor="theme-category" className="text-sm font-medium">
                  Category
                </Label>
                <Select
                  value={newThemeCategory}
                  onValueChange={(v) => setNewThemeCategory(v as ThemeCategory)}
                >
                  <SelectTrigger id="theme-category" className="h-12 text-base px-4">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light" className="py-3">
                      <span className="flex items-center gap-3">
                        <Sun className="w-5 h-5" />
                        Light Theme
                      </span>
                    </SelectItem>
                    <SelectItem value="dark" className="py-3">
                      <span className="flex items-center gap-3">
                        <Moon className="w-5 h-5" />
                        Dark Theme
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Helps organize and search your themes
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t" />

            {/* Color editor */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-medium">Color Palette</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Click on any color swatch to open the color picker
                </p>
              </div>
              <ThemeColorEditor
                colors={newThemeColors}
                onChange={setNewThemeColors}
              />
            </div>
          </CardContent>
          <CardFooter className="border-t bg-muted/40 flex justify-between items-center py-4 px-6">
            <p className="text-sm text-muted-foreground">
              {editingTheme ? "Unsaved changes will be lost" : "Theme will be saved locally"}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleCancelEdit} className="px-6">
                Cancel
              </Button>
              <Button onClick={handleSaveTheme} disabled={!newThemeName.trim()} className="px-6">
                {editingTheme ? "Save Changes" : "Create Theme"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Font Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="h-5 w-5 text-indigo-500" />
            Font Selection
          </CardTitle>
          <CardDescription>
            Choose the font family used throughout the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label htmlFor="font-select">Application Font</Label>
            <Select value={activeFont} onValueChange={setFont}>
              <SelectTrigger id="font-select" className="w-full max-w-xs">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((font) => (
                  <SelectItem
                    key={font.id}
                    value={font.id}
                    style={{ fontFamily: font.family }}
                  >
                    {font.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font preview */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <p className="text-sm text-muted-foreground mb-2">Preview:</p>
            <p className="text-lg">
              The quick brown fox jumps over the lazy dog.
            </p>
            <p className="text-sm mt-1">
              ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Theme</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this custom theme? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteTheme(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
