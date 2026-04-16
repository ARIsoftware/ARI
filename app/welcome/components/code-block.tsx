"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

interface CodeBlockProps {
  code: string
  language?: string
  hideHeader?: boolean
}

export function CodeBlock({ code, language = "bash", hideHeader = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50">
      {/* Header */}
      {!hideHeader && (
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
      )}
      {/* Headerless copy button (appears on hover) */}
      {hideHeader && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-xs text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-zinc-900 group-hover:opacity-100"
          aria-label="Copy to clipboard"
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
      )}
      {/* Code content */}
      <div className="bg-zinc-50 p-4">
        <pre className="text-sm text-zinc-800 whitespace-pre-wrap" style={{ fontFamily: 'Geist Mono, monospace' }}>
          {code}
        </pre>
      </div>
    </div>
  )
}
