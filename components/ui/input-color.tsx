"use client"

import { useState, useCallback } from "react"
import { Pipette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Convert HSL string "H S% L%" to hex color
function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/)
  const h = parseFloat(parts[0]) || 0
  const s = parseFloat(parts[1]) || 0
  const l = parseFloat(parts[2]) || 0

  const sNorm = s / 100
  const lNorm = l / 100

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0, g = 0, b = 0

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Convert hex to HSL string "H S% L%"
function hexToHsl(hex: string): string {
  let r = 0, g = 0, b = 0

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16)
    g = parseInt(hex[2] + hex[2], 16)
    b = parseInt(hex[3] + hex[3], 16)
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16)
    g = parseInt(hex.slice(3, 5), 16)
    b = parseInt(hex.slice(5, 7), 16)
  }

  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

// Parse HSL string to components
function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.trim().split(/\s+/)
  return {
    h: parseFloat(parts[0]) || 0,
    s: parseFloat(parts[1]) || 0,
    l: parseFloat(parts[2]) || 0,
  }
}

// Build HSL string from components
function buildHsl(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`
}

interface InputColorProps {
  value: string // HSL format: "H S% L%"
  onChange: (value: string) => void
  className?: string
}

export function InputColor({ value, onChange, className }: InputColorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hexValue = hslToHex(value)
  const { h, s, l } = parseHsl(value)

  const handleHueChange = useCallback((values: number[]) => {
    onChange(buildHsl(values[0], s, l))
  }, [s, l, onChange])

  const handleSaturationChange = useCallback((values: number[]) => {
    onChange(buildHsl(h, values[0], l))
  }, [h, l, onChange])

  const handleLightnessChange = useCallback((values: number[]) => {
    onChange(buildHsl(h, s, values[0]))
  }, [h, s, onChange])

  const handleHexInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hexToHsl(hex))
    }
  }, [onChange])

  const handleEyeDropper = useCallback(async () => {
    if ('EyeDropper' in window) {
      try {
        // @ts-expect-error EyeDropper API is not in TypeScript types yet
        const eyeDropper = new window.EyeDropper()
        const result = await eyeDropper.open()
        onChange(hexToHsl(result.sRGBHex))
      } catch {
        // User cancelled or error
      }
    }
  }, [onChange])

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative w-12 h-12 rounded-xl shadow-sm border-2 border-white/20 ring-1 ring-black/5 transition-all hover:scale-105 hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary",
            className
          )}
          style={{ backgroundColor: hexValue }}
        >
          <span className="sr-only">Pick color</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-4">
          {/* Color preview with hex input */}
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-lg border shadow-inner flex-shrink-0"
              style={{ backgroundColor: hexValue }}
            />
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Hex</Label>
              <div className="flex items-center gap-1">
                <Input
                  value={hexValue.toUpperCase()}
                  onChange={handleHexInput}
                  className="font-mono text-sm h-8"
                  maxLength={7}
                />
                {hasEyeDropper && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={handleEyeDropper}
                    title="Pick color from screen"
                  >
                    <Pipette className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Hue slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Hue</Label>
              <span className="text-xs font-mono text-muted-foreground">{Math.round(h)}°</span>
            </div>
            <div
              className="h-3 rounded-full"
              style={{
                background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
              }}
            >
              <Slider
                value={[h]}
                onValueChange={handleHueChange}
                min={0}
                max={360}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_.relative]:bg-transparent"
              />
            </div>
          </div>

          {/* Saturation slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Saturation</Label>
              <span className="text-xs font-mono text-muted-foreground">{Math.round(s)}%</span>
            </div>
            <div
              className="h-3 rounded-full"
              style={{
                background: `linear-gradient(to right, hsl(${h}, 0%, ${l}%), hsl(${h}, 100%, ${l}%))`,
              }}
            >
              <Slider
                value={[s]}
                onValueChange={handleSaturationChange}
                min={0}
                max={100}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_.relative]:bg-transparent"
              />
            </div>
          </div>

          {/* Lightness slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Lightness</Label>
              <span className="text-xs font-mono text-muted-foreground">{Math.round(l)}%</span>
            </div>
            <div
              className="h-3 rounded-full"
              style={{
                background: `linear-gradient(to right, hsl(${h}, ${s}%, 0%), hsl(${h}, ${s}%, 50%), hsl(${h}, ${s}%, 100%))`,
              }}
            >
              <Slider
                value={[l]}
                onValueChange={handleLightnessChange}
                min={0}
                max={100}
                step={1}
                className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-2 [&_[role=slider]]:border-white [&_[role=slider]]:shadow-md [&_.relative]:bg-transparent"
              />
            </div>
          </div>

          {/* HSL display */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">HSL</span>
              <span className="font-mono">{value}</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { hslToHex, hexToHsl }
