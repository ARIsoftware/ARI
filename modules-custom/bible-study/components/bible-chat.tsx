'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageCircle, Send, Trash2, X, Loader2, Minimize2, Maximize2, Sparkles, BookOpen, Languages, Users } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useChatMessages, useSendChatMessage, useClearChat } from '../hooks/use-bible-study'
import type { StudyContext } from '../types'

interface BibleChatProps {
  studyContext?: StudyContext | null
}

// Simple markdown renderer for bold, italic, headings, and lists
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Horizontal rule
        if (line.trim() === '---') {
          return <hr key={i} className="border-border my-2" />
        }

        // Heading 2
        if (line.startsWith('## ')) {
          return <p key={i} className="font-bold text-sm mt-2">{renderInline(line.slice(3))}</p>
        }

        // Heading 3
        if (line.startsWith('### ')) {
          return <p key={i} className="font-semibold text-sm mt-1">{renderInline(line.slice(4))}</p>
        }

        // Heading 4
        if (line.startsWith('#### ')) {
          return <p key={i} className="font-medium text-sm">{renderInline(line.slice(5))}</p>
        }

        // Bullet list
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return <p key={i} className="text-sm pl-3">• {renderInline(line.slice(2))}</p>
        }

        // Numbered list
        if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^(\d+)\.\s(.*)/)
          if (match) {
            return <p key={i} className="text-sm pl-3">{match[1]}. {renderInline(match[2])}</p>
          }
        }

        // Empty line
        if (line.trim() === '') {
          return <div key={i} className="h-1" />
        }

        // Regular paragraph
        return <p key={i} className="text-sm">{renderInline(line)}</p>
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  // Split on bold+italic, bold, italic, or code
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('***') && part.endsWith('***')) {
      return <strong key={i}><em>{part.slice(3, -3)}</em></strong>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted/50 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return part
  })
}

const QUICK_ACTIONS = [
  {
    label: 'Lesson Plan',
    icon: BookOpen,
    prompt: 'Please generate a complete lesson plan for this passage, including learning objectives, outline with main points, discussion questions, application, and age-specific activities for kids (ages 3-8) and adults.',
  },
  {
    label: 'Hebrew/Greek',
    icon: Languages,
    prompt: 'What are the key Hebrew or Greek words in this passage? Please provide the original word, transliteration, and detailed meaning for each.',
  },
  {
    label: 'Kids Version',
    icon: Users,
    prompt: 'How would you explain this passage to young children ages 3-8? Please include a simple explanation, a fun activity or object lesson, and a memory point.',
  },
  {
    label: 'Deep Dive',
    icon: Sparkles,
    prompt: 'Give me a deep theological and historical analysis of this passage. Include cultural context, cross-references, and the mysteries or deeper meanings within the text.',
  },
]

export default function BibleChat({ studyContext }: BibleChatProps) {
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: messages = [], isLoading } = useChatMessages()
  const sendMessage = useSendChatMessage()
  const clearChat = useClearChat()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!message.trim() || sendMessage.isPending) return

    const text = message.trim()
    setMessage('')

    sendMessage.mutate(
      { message: text, study_context: studyContext ?? null },
      {
        onError: (err) => {
          setMessage(text)
          toast({ variant: 'destructive', title: 'Chat Error', description: err.message })
        },
      }
    )
  }

  const handleQuickAction = (prompt: string) => {
    if (sendMessage.isPending) return

    let fullPrompt = prompt
    if (studyContext) {
      fullPrompt = `Regarding "${studyContext.title}" (${studyContext.book} ${studyContext.chapter}): ${prompt}`
    }

    sendMessage.mutate(
      { message: fullPrompt, study_context: studyContext ?? null },
      {
        onError: (err) => {
          toast({ variant: 'destructive', title: 'Chat Error', description: err.message })
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    clearChat.mutate(undefined, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to clear chat' }),
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
        title="Open Bible Study Chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Card className={`w-[460px] shadow-2xl flex flex-col ${isMinimized ? 'h-auto' : 'h-[600px]'}`}>

        {/* Header */}
        <CardHeader
          className="pb-2 flex flex-row items-center justify-between space-y-0 cursor-pointer select-none border-b"
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Bible Study Assistant
          </CardTitle>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClear} disabled={messages.length === 0} title="Clear chat">
              <Trash2 className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? 'Expand' : 'Minimize'}>
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)} title="Close">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>

        {!isMinimized && (
          <CardContent className="flex flex-col flex-1 p-3 pt-2 overflow-hidden gap-2">

            {/* Study context badge */}
            {studyContext && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 shrink-0">
                📖 Context: <strong>{studyContext.title}</strong> — {studyContext.book} {studyContext.chapter}
              </div>
            )}

            {/* Quick action buttons */}
            <div className="flex flex-wrap gap-1 shrink-0">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 px-2"
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={sendMessage.isPending}
                >
                  <action.icon className="w-3 h-3" />
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
                  <MessageCircle className="w-8 h-8 mx-auto opacity-30" />
                  <p>Ask a Bible question or use a quick action above.</p>
                  <p className="text-xs opacity-70">Powered by OpenRouter AI</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-lg px-3 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground text-sm'
                        : 'bg-muted text-foreground'
                    }`}>
                      {msg.role === 'assistant'
                        ? <MarkdownText text={msg.content} />
                        : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      }
                    </div>
                  </div>
                ))
              )}

              {sendMessage.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="flex gap-1 items-end shrink-0">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about scripture... (Enter to send, Shift+Enter for new line)"
                className="text-sm resize-none min-h-[36px] max-h-[120px]"
                rows={1}
                disabled={sendMessage.isPending}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => handleSend()}
                disabled={!message.trim() || sendMessage.isPending}
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>

          </CardContent>
        )}
      </Card>
    </div>
  )
}
