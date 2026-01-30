"use client"

import { useState, useCallback } from "react"
import { ChevronDown, Palette, Paintbrush, Layout, BarChart3, PanelLeft, AlertCircle } from "lucide-react"
import { InputColor, hslToHex, hexToHsl } from "@/components/ui/input-color"
import type { ThemeColors } from "@/lib/theme/types"

interface ColorFieldProps {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ label, description, value, onChange }: ColorFieldProps) {
  return (
    <div className="group flex items-center gap-4 p-4 rounded-xl hover:bg-muted/40 transition-colors">
      {/* Color picker */}
      <InputColor value={value} onChange={onChange} />

      {/* Label and description */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>

      {/* HSL value display */}
      <div className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded hidden sm:block">
        {value}
      </div>
    </div>
  )
}

// Group definitions for organizing colors with icons and descriptions
const COLOR_GROUPS = [
  {
    name: 'Core Colors',
    icon: Palette,
    description: 'Main background and text colors',
    fields: [
      { key: 'background', label: 'Background', description: 'Page background color' },
      { key: 'foreground', label: 'Foreground', description: 'Main text color' },
      { key: 'border', label: 'Border', description: 'Default border color' },
      { key: 'input', label: 'Input', description: 'Form input backgrounds' },
      { key: 'ring', label: 'Focus Ring', description: 'Focus indicator color' },
    ],
  },
  {
    name: 'Brand Colors',
    icon: Paintbrush,
    description: 'Primary and accent colors for buttons and links',
    fields: [
      { key: 'primary', label: 'Primary', description: 'Main brand color' },
      { key: 'primaryForeground', label: 'Primary Text', description: 'Text on primary backgrounds' },
      { key: 'secondary', label: 'Secondary', description: 'Secondary actions' },
      { key: 'secondaryForeground', label: 'Secondary Text', description: 'Text on secondary backgrounds' },
      { key: 'accent', label: 'Accent', description: 'Highlights and accents' },
      { key: 'accentForeground', label: 'Accent Text', description: 'Text on accent backgrounds' },
    ],
  },
  {
    name: 'UI Elements',
    icon: Layout,
    description: 'Cards, popovers, and muted elements',
    fields: [
      { key: 'card', label: 'Card', description: 'Card backgrounds' },
      { key: 'cardForeground', label: 'Card Text', description: 'Text on cards' },
      { key: 'popover', label: 'Popover', description: 'Dropdown and popover backgrounds' },
      { key: 'popoverForeground', label: 'Popover Text', description: 'Text in popovers' },
      { key: 'muted', label: 'Muted', description: 'Subtle backgrounds' },
      { key: 'mutedForeground', label: 'Muted Text', description: 'Secondary text' },
    ],
  },
  {
    name: 'Status Colors',
    icon: AlertCircle,
    description: 'Error and warning states',
    fields: [
      { key: 'destructive', label: 'Destructive', description: 'Error and danger states' },
      { key: 'destructiveForeground', label: 'Destructive Text', description: 'Text on destructive backgrounds' },
    ],
  },
  {
    name: 'Sidebar',
    icon: PanelLeft,
    description: 'Navigation sidebar styling',
    fields: [
      { key: 'sidebarBackground', label: 'Background', description: 'Sidebar background' },
      { key: 'sidebarForeground', label: 'Text', description: 'Sidebar text color' },
      { key: 'sidebarPrimary', label: 'Primary', description: 'Active item highlight' },
      { key: 'sidebarPrimaryForeground', label: 'Primary Text', description: 'Active item text' },
      { key: 'sidebarAccent', label: 'Accent', description: 'Hover states' },
      { key: 'sidebarAccentForeground', label: 'Accent Text', description: 'Hover text' },
      { key: 'sidebarBorder', label: 'Border', description: 'Sidebar borders' },
      { key: 'sidebarRing', label: 'Focus Ring', description: 'Sidebar focus states' },
    ],
  },
  {
    name: 'Charts',
    icon: BarChart3,
    description: 'Data visualization colors',
    fields: [
      { key: 'chart1', label: 'Chart 1', description: 'First chart color' },
      { key: 'chart2', label: 'Chart 2', description: 'Second chart color' },
      { key: 'chart3', label: 'Chart 3', description: 'Third chart color' },
      { key: 'chart4', label: 'Chart 4', description: 'Fourth chart color' },
      { key: 'chart5', label: 'Chart 5', description: 'Fifth chart color' },
    ],
  },
] as const

interface ThemeColorEditorProps {
  colors: ThemeColors
  onChange: (colors: ThemeColors) => void
}

export function ThemeColorEditor({ colors, onChange }: ThemeColorEditorProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Core Colors', 'Brand Colors'])
  )

  const toggleGroup = useCallback((groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) {
        next.delete(groupName)
      } else {
        next.add(groupName)
      }
      return next
    })
  }, [])

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, value: string) => {
      onChange({ ...colors, [key]: value })
    },
    [colors, onChange]
  )

  return (
    <div className="space-y-3">
      {COLOR_GROUPS.map((group) => {
        const Icon = group.icon
        const isExpanded = expandedGroups.has(group.name)

        return (
          <div
            key={group.name}
            className="rounded-2xl border bg-card overflow-hidden transition-shadow hover:shadow-sm"
          >
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.name)}
              className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-muted/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{group.name}</p>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Preview swatches */}
                <div className="hidden sm:flex items-center gap-1">
                  {group.fields.slice(0, 3).map((field) => (
                    <div
                      key={field.key}
                      className="w-5 h-5 rounded-md ring-1 ring-black/10"
                      style={{ backgroundColor: hslToHex(colors[field.key as keyof ThemeColors]) }}
                    />
                  ))}
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t bg-muted/20">
                <div className="py-2">
                  {group.fields.map((field) => (
                    <ColorField
                      key={field.key}
                      label={field.label}
                      description={field.description}
                      value={colors[field.key as keyof ThemeColors]}
                      onChange={(value) => handleColorChange(field.key as keyof ThemeColors, value)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Export utilities
export { hslToHex, hexToHsl }
