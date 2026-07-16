'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  text: string
  className?: string
}

/** Copy-to-clipboard button with a brief "Copied" confirmation. */
export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground',
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
