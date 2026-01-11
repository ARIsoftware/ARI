"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, Loader2, Type } from "lucide-react"
import { FONT_OPTIONS } from "../types"

interface FontsTabProps {
  selectedFont: string
  savedFont: string
  fontSaving: boolean
  onFontChange: (value: string) => void
  onSaveFont: () => void
}

export function FontsTab({
  selectedFont,
  savedFont,
  fontSaving,
  onFontChange,
  onSaveFont,
}: FontsTabProps): React.ReactElement {
  const hasUnsavedChanges = selectedFont !== savedFont

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Type className="h-5 w-5 text-indigo-500" />
            Font Selection
          </CardTitle>
          <CardDescription>
            Choose the font family used throughout the application. Changes are previewed immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="font-select">Application Font</Label>
            <Select value={selectedFont} onValueChange={onFontChange}>
              <SelectTrigger id="font-select" className="w-full max-w-xs">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((font) => (
                  <SelectItem
                    key={font.value}
                    value={font.value}
                    style={{ fontFamily: font.css }}
                  >
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Select a font to preview it immediately. Click "Save Font" to make it permanent.
            </p>
          </div>

          {hasUnsavedChanges && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              You have unsaved font changes. Click "Save Font" to apply permanently.
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t bg-muted/60 flex justify-between items-center pt-4">
          <div className="text-sm text-muted-foreground">
            Current saved font: <span className="font-medium">{savedFont}</span>
          </div>
          <Button
            onClick={onSaveFont}
            disabled={fontSaving || !hasUnsavedChanges}
          >
            {fontSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                Save Font
              </span>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
