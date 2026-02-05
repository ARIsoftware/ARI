"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language = "bash" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-100 border-b border-zinc-200">
        <span className="text-xs text-zinc-500 font-medium" style={{ fontFamily: 'Geist Mono, monospace' }}>
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <div className="bg-zinc-50 p-4">
        <pre className="text-sm text-zinc-800 whitespace-pre-wrap" style={{ fontFamily: 'Geist Mono, monospace' }}>
          {code}
        </pre>
      </div>
    </div>
  )
}
