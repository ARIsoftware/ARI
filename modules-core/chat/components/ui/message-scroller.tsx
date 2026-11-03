'use client'

/**
 * shadcn/ui Message Scroller (June 2026 chat components), adapted to ARI's
 * Tailwind 3 + HSL theme tokens. Behaviour comes from the headless
 * `@shadcn/react` primitive: it follows a streaming reply only while you're
 * at the bottom, anchors each new user turn near the top, and restores the
 * last turn when a saved chat opens.
 */

import * as React from 'react'
import {
  MessageScroller as MessageScrollerPrimitive,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@shadcn/react/message-scroller'
import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function MessageScrollerProvider(props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>) {
  return <MessageScrollerPrimitive.Provider {...props} />
}

function MessageScroller({ className, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      data-slot="message-scroller"
      className={cn('group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden', className)}
      {...props}
    />
  )
}

function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      data-slot="message-scroller-viewport"
      className={cn(
        'size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain outline-none [contain:content] [scrollbar-gutter:stable] [scrollbar-width:thin] data-[autoscrolling]:[scrollbar-width:none] data-[pending-scroll]:invisible',
        className,
      )}
      {...props}
    />
  )
}

function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return (
    <MessageScrollerPrimitive.Content
      data-slot="message-scroller-content"
      className={cn('flex h-max min-h-full flex-col gap-8', className)}
      {...props}
    />
  )
}

function MessageScrollerItem({
  className,
  scrollAnchor = false,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return (
    <MessageScrollerPrimitive.Item
      data-slot="message-scroller-item"
      scrollAnchor={scrollAnchor}
      className={cn('min-w-0 shrink-0 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]', className)}
      {...props}
    />
  )
}

/** Floating "jump to latest" pill; hidden while you're already at that edge. */
function MessageScrollerButton({
  direction = 'end',
  className,
  children,
  ...props
}: React.ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  return (
    <MessageScrollerPrimitive.Button
      data-slot="message-scroller-button"
      data-direction={direction}
      direction={direction}
      className={cn(
        'absolute left-1/2 z-20 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-foreground shadow-md outline-none transition-[transform,opacity] duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
        'data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0',
        'data-[active=true]:scale-100 data-[active=true]:opacity-100',
        'data-[direction=end]:bottom-4 data-[direction=start]:top-4 data-[direction=start]:[&_svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDown />
          <span className="sr-only">{direction === 'end' ? 'Scroll to latest' : 'Scroll to start'}</span>
        </>
      )}
    </MessageScrollerPrimitive.Button>
  )
}

export {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
}
