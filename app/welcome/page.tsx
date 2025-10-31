"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function WelcomePage() {
  const [completedLines, setCompletedLines] = useState<string[]>([])
  const [currentLineText, setCurrentLineText] = useState("")
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [isTyping, setIsTyping] = useState(false)
  const [textOpacity, setTextOpacity] = useState(1)
  const [showBackground, setShowBackground] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const sequence = [
    { delay: 2000, text: "HELLO." },
    { delay: 2000, text: "I am very happy that we can meet." },
    { delay: 2000, text: "I am ARI. I am software." },
    { delay: 2000, text: "However, I am not like other software." },
    { delay: 2000, text: "I am free. Free to grow. Ever expandable. No limits." },
    { delay: 2000, text: "I am open source." },
    { delay: 2000, text: "I am yours." },
  ]

  useEffect(() => {
    let timeouts: NodeJS.Timeout[] = []

    const typeCharacter = (text: string, charIndex: number, lineIndex: number) => {
      if (charIndex < text.length) {
        setCurrentLineText(text.slice(0, charIndex + 1))
        const timeout = setTimeout(() => {
          typeCharacter(text, charIndex + 1, lineIndex)
        }, 34) // Type each character with 34ms delay (20% faster than 42ms)
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

              // After fade out completes (2 seconds), show onboarding
              const onboardingTimeout = setTimeout(() => {
                setShowOnboarding(true)
              }, 2000)
              timeouts.push(onboardingTimeout)
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
        className="absolute top-[70px] left-[70px] space-y-8 transition-opacity transition-duration-[2000ms] z-10"
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
        <div className="absolute inset-0">
          <Image
            src="/welcome.png"
            alt="Welcome background"
            fill
            className="object-cover"
          />
        </div>
      )}

      {/* Onboarding Wizard */}
      {showOnboarding && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20 transition-opacity transition-duration-[2000ms]"
          style={{ opacity: showOnboarding ? 1 : 0 }}
        >
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Welcome! Let's get you set up</CardTitle>
              <CardDescription>
                Complete your profile and invite your team to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="company" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="company">Company Details</TabsTrigger>
                  <TabsTrigger value="share">Share</TabsTrigger>
                </TabsList>
                <TabsContent value="company" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input id="name" placeholder="Your full name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" placeholder="your@email.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" placeholder="Your job title" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company Name</Label>
                    <Input id="company" placeholder="Your company name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="domain">Domain Name</Label>
                    <Input id="domain" placeholder="yourcompany.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">LinkedIn URL</Label>
                    <Input id="linkedin" placeholder="https://linkedin.com/in/yourprofile" />
                  </div>
                  <Button className="w-full bg-black hover:bg-black/90 text-white">
                    Continue
                  </Button>
                </TabsContent>
                <TabsContent value="share" className="mt-4">
                  <p className="text-sm text-muted-foreground">Share content will go here</p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
