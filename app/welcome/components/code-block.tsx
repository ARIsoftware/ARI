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
    <div className="rounded-lg overflow-hidden border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2a2a2a]">
        <span className="text-xs text-gray-400" style={{ fontFamily: 'Geist Mono, monospace' }}>
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
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
      <div className="bg-[#1a1a1a] p-4">
        <pre className="text-sm text-gray-100 whitespace-pre-wrap" style={{ fontFamily: 'Geist Mono, monospace' }}>
          {code}
        </pre>
      </div>
    </div>
  )
}
