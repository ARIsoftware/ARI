'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Trash2, Send, MessageCircle, BookOpen, Languages, Users, Sparkles, Copy, Check, Edit2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  useConversations,
  useConversation,
  useCreateConversation,
  useRenameConversation,
  useDeleteConversation,
  useSendConversationMessage,
} from '../../hooks/use-bible-study'
import type { Conversation, ConversationMessage } from '../../types'

// ── Markdown renderer ──────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('***') && part.endsWith('***')) return <strong key={i}><em>{part.slice(3, -3)}</em></strong>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-muted px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    return part
  })
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.trim() === '---') return <hr key={i} className="border-border my-3" />
        if (line.startsWith('## ')) return <p key={i} className="font-bold text-base mt-3 mb-1">{renderInline(line.slice(3))}</p>
        if (line.startsWith('### ')) return <p key={i} className="font-semibold mt-2 mb-0.5">{renderInline(line.slice(4))}</p>
        if (line.startsWith('#### ')) return <p key={i} className="font-medium mt-1">{renderInline(line.slice(5))}</p>
        if (line.startsWith('- ') || line.startsWith('* ')) return <p key={i} className="pl-4">• {renderInline(line.slice(2))}</p>
        if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+)\.\s(.*)/)
          if (m) return <p key={i} className="pl-4">{m[1]}. {renderInline(m[2])}</p>
        }
        if (line.trim() === '') return <div key={i} className="h-2" />
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ── Quick actions ──────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    label: 'Lesson Plan',
    icon: BookOpen,
    prompt: 'Create a complete lesson plan for this passage. Include the passage reference, target audience options, title, learning objectives, opening/introduction, main teaching points with Scripture references, discussion questions (observation, interpretation, application), application/reflection, prayer focus, and suggested activities for kids, youth, and adults.',
  },
  {
    label: 'Discussion Questions',
    icon: MessageCircle,
    prompt: 'Generate a set of discussion questions for this passage — include observation questions (what does it say?), interpretation questions (what does it mean?), and application questions (how does this apply to my life today?).',
  },
  {
    label: 'Hebrew / Greek',
    icon: Languages,
    prompt: 'Identify the key Hebrew or Greek words in this passage and provide the original word, transliteration, detailed meaning, and how understanding the original language deepens this passage.',
  },
  {
    label: 'Kid-Friendly',
    icon: Users,
    prompt: 'Explain this passage in simple terms for children ages 3–10. Include a child-friendly explanation, an object lesson or hands-on activity, and a simple memory point they can take home.',
  },
  {
    label: 'Deep Dive',
    icon: Sparkles,
    prompt: 'Give me a deep theological and historical analysis of this passage — include cultural and historical context, cross-references, original language insights, and any deeper spiritual mysteries or themes present in the text.',
  },
]

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ConversationMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {isUser
          ? <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          : (
            <div className="relative">
              <MarkdownText text={msg.content} />
              <div className="flex justify-end mt-1">
                <CopyButton text={msg.content} />
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}

// ── Conversation list item ─────────────────────────────────────────────────────

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== conv.title) onRename(trimmed)
    setEditing(false)
  }

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}`}
      onClick={onSelect}
    >
      <MessageCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

      {editing ? (
        <form
          className="flex-1 flex gap-1"
          onSubmit={(e) => { e.preventDefault(); commitRename() }}
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEditValue(conv.title); setEditing(false) } }}
            className="h-5 text-xs px-1 py-0 flex-1"
          />
        </form>
      ) : (
        <span className="flex-1 truncate">{conv.title}</span>
      )}

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
        <button className="p-1 rounded hover:bg-muted" onClick={() => setEditing(true)} title="Rename">
          <Edit2 className="w-3 h-3 text-muted-foreground" />
        </button>
        <button className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" onClick={onDelete} title="Delete">
          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BibleStudyChatPage() {
  const { toast } = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: conversations = [], isLoading: convsLoading } = useConversations()
  const { data: activeData, isLoading: msgsLoading } = useConversation(activeId)
  const createConversation = useCreateConversation()
  const renameConversation = useRenameConversation()
  const deleteConversation = useDeleteConversation()
  const sendMessage = useSendConversationMessage()

  const messages: ConversationMessage[] = activeData?.messages || []
  const activeConversation: Conversation | undefined = activeData?.conversation

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-select first conversation on load
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id)
    }
  }, [conversations, activeId])

  const handleNewChat = () => {
    createConversation.mutate(undefined, {
      onSuccess: (conv) => setActiveId(conv.id),
      onError: () => toast({ variant: 'destructive', title: 'Failed to create conversation' }),
    })
  }

  const handleDelete = (id: string) => {
    deleteConversation.mutate(id, {
      onSuccess: () => {
        if (activeId === id) setActiveId(conversations.find((c) => c.id !== id)?.id ?? null)
      },
      onError: () => toast({ variant: 'destructive', title: 'Failed to delete conversation' }),
    })
  }

  const handleRename = (id: string, title: string) => {
    renameConversation.mutate({ id, title }, {
      onError: () => toast({ variant: 'destructive', title: 'Failed to rename' }),
    })
  }

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || sendMessage.isPending) return
    if (!activeId) {
      // Create a conversation first then send
      createConversation.mutate(undefined, {
        onSuccess: (conv) => {
          setActiveId(conv.id)
          setInput('')
          sendMessage.mutate(
            { conversationId: conv.id, message: msg },
            { onError: (err) => toast({ variant: 'destructive', title: 'Error', description: err.message }) }
          )
        },
      })
      return
    }
    setInput('')
    sendMessage.mutate(
      { conversationId: activeId, message: msg },
      { onError: (err) => { setInput(msg); toast({ variant: 'destructive', title: 'Error', description: err.message }) } }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const isPending = sendMessage.isPending || createConversation.isPending

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* Sidebar — conversation list */}
      <aside className="w-64 shrink-0 border-r flex flex-col bg-muted/20 overflow-hidden">
        <div className="p-3 border-b">
          <Button className="w-full gap-2" size="sm" onClick={handleNewChat} disabled={createConversation.isPending}>
            {createConversation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Plus className="w-4 h-4" />
            }
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {convsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={() => setActiveId(conv.id)}
                onDelete={() => handleDelete(conv.id)}
                onRename={(title) => handleRename(conv.id, title)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Chat header */}
        <div className="border-b px-6 py-3 shrink-0">
          <h1 className="text-lg font-medium truncate">
            {activeConversation?.title || 'Bible Study Assistant'}
          </h1>
          <p className="text-xs text-muted-foreground">Ask questions, explore Scripture, generate lesson plans</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!activeId ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <BookOpen className="w-12 h-12 text-muted-foreground opacity-40" />
              <div>
                <p className="font-medium">Start a Bible Study Chat</p>
                <p className="text-sm text-muted-foreground mt-1">Ask a question or use a quick action below</p>
              </div>
            </div>
          ) : msgsLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <MessageCircle className="w-10 h-10 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">Type a message or use a quick action to get started</p>
            </div>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}

          {isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions */}
        <div className="px-6 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5"
              onClick={() => handleSend(action.prompt)}
              disabled={isPending}
            >
              <action.icon className="w-3 h-3" />
              {action.label}
            </Button>
          ))}
        </div>

        {/* Input */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex gap-2 items-end border rounded-xl p-2 bg-background focus-within:ring-2 focus-within:ring-ring">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a passage, topic, doctrine… (Enter to send, Shift+Enter for new line)"
              className="border-0 focus-visible:ring-0 resize-none bg-transparent text-sm min-h-[36px] max-h-[160px] flex-1 p-1"
              rows={1}
              disabled={isPending}
            />
            <Button
              size="icon"
              className="shrink-0 h-9 w-9 rounded-lg"
              onClick={() => handleSend()}
              disabled={!input.trim() || isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 text-center">Powered by OpenRouter · Responses may reflect one of several valid Christian interpretations</p>
        </div>

      </main>
    </div>
  )
}
