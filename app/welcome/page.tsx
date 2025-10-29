"use client"

import { useEffect, useState } from "react"
import Image from "next/image"

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [textOpacity, setTextOpacity] = useState(1)
  const [showBackground, setShowBackground] = useState(false)

  const sequence = [
    { delay: 2000, text: "HELLO." },
    { delay: 2000, text: "I am very happy that we can meet." },
    { delay: 2000, text: "I am ARI. I am software." },
    { delay: 2000, text: "However, I am not like other software." },
    { delay: 2000, text: "I am free." },
  ]

  useEffect(() => {
    let timeouts: NodeJS.Timeout[] = []

    const typeCharacter = (text: string, charIndex: number, lineIndex: number) => {
      if (charIndex < text.length) {
        setCurrentLineText(text.slice(0, charIndex + 1))
        const timeout = setTimeout(() => {
          typeCharacter(text, charIndex + 1, lineIndex)
        }, 42) // Type each character with 42ms delay (15% faster than 50ms)
        timeouts.push(timeout)
      } else {
        // Line complete, wait before next line
        setIsTyping(false)
        const nextLineIndex = lineIndex + 1

        if (nextLineIndex < sequence.length) {
          // More lines to show
          const timeout = setTimeout(() => {
            setCompletedLines((prev) => [...prev, text])
            setCurrentLineText("")
            startNextLine(nextLineIndex)
          }, sequence[nextLineIndex].delay)
          timeouts.push(timeout)
        } else {
          // Last line complete - wait 3 seconds then fade out
          const timeout = setTimeout(() => {
            setCompletedLines((prev) => [...prev, text])
            setCurrentLineText("")

            // Wait 3 seconds, then start fade out
            const fadeTimeout = setTimeout(() => {
              setTextOpacity(0)

              // After fade out completes (2 seconds), show background
              const bgTimeout = setTimeout(() => {
                setShowBackground(true)
              }, 2000)
              timeouts.push(bgTimeout)
            }, 3000)
            timeouts.push(fadeTimeout)
          }, 0)
          timeouts.push(timeout)
        }
      }
    }

    const startNextLine = (index: number) => {
      if (index < sequence.length) {
        setCurrentLineIndex(index)
        setIsTyping(true)
        typeCharacter(sequence[index].text, 0, index)
      }
    }

    // Start the first line after initial delay
    const initialTimeout = setTimeout(() => {
      startNextLine(0)
    }, sequence[0].delay)
    timeouts.push(initialTimeout)

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [])

  const allLines = [...completedLines]
  if (currentLineText) {
    allLines.push(currentLineText)
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Text content */}
      <div
        className="absolute top-[70px] left-[70px] space-y-8 transition-opacity duration-[2000ms]"
        style={{ opacity: textOpacity }}
      >
        {allLines.map((line, index) => {
          const isCurrentLine = index === allLines.length - 1 && isTyping
          const isComplete = index < completedLines.length
          const hasPeriod = line.endsWith(".")
          const textWithoutPeriod = hasPeriod ? line.slice(0, -1) : line
          const isFirstLine = index === 0

          return (
            <div
              key={index}
              className="font-mono"
              style={isFirstLine ? { fontSize: '50px', fontWeight: 900 } : { fontSize: '24px' }}
            >
              {textWithoutPeriod}
              {hasPeriod && (
                <>
                  {isCurrentLine || !isComplete ? (
                    <span className="animate-blink">.</span>
                  ) : (
                    <span>.</span>
                  )}
                </>
              )}
              {!hasPeriod && isCurrentLine && (
                <span className="animate-blink">.</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Background image */}
      {showBackground && (
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-[2000ms]"
          style={{ opacity: showBackground ? 1 : 0 }}
        >
          <Image
            src="/welcome.png"
            alt="Welcome background"
            width={1200}
            height={800}
            className="object-contain"
          />
        </div>
      )}
    </div>
  )
}
