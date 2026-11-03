/**
 * shadcn/ui Attachment (June 2026 chat components), adapted to ARI's
 * Tailwind 3 tokens: file / image cards with upload state, metadata,
 * actions and a full-card trigger.
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export type AttachmentState = 'idle' | 'uploading' | 'processing' | 'error' | 'done'

const attachmentVariants = cva(
  'group/attachment relative flex w-fit max-w-full min-w-0 shrink-0 rounded-xl border bg-card text-card-foreground transition-colors focus-within:ring-1 focus-within:ring-ring/50 has-[[data-slot=attachment-trigger]]:hover:bg-muted/50 data-[state=error]:border-destructive/40 data-[state=idle]:border-dashed',
  {
    variants: {
      size: {
        default: 'gap-2.5 p-2 text-sm',
        sm: 'gap-2 p-1.5 text-xs',
      },
      orientation: {
        horizontal: 'min-w-40 items-center',
        vertical: 'w-24 flex-col',
      },
    },
    defaultVariants: { size: 'default', orientation: 'horizontal' },
  },
)

function Attachment({
  className,
  state = 'done',
  size = 'default',
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof attachmentVariants> & { state?: AttachmentState }) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      data-size={size}
      data-orientation={orientation}
      className={cn(attachmentVariants({ size, orientation }), className)}
      {...props}
    />
  )
}

const attachmentMediaVariants = cva(
  "relative flex aspect-square w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground group-data-[orientation=vertical]/attachment:w-full group-data-[size=sm]/attachment:w-8 group-data-[state=error]/attachment:bg-destructive/10 group-data-[state=error]/attachment:text-destructive [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        icon: '',
        image:
          'opacity-60 group-data-[state=done]/attachment:opacity-100 group-data-[state=idle]/attachment:opacity-100 [&>img]:size-full [&>img]:object-cover',
      },
    },
    defaultVariants: { variant: 'icon' },
  },
)

function AttachmentMedia({
  className,
  variant = 'icon',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof attachmentMediaVariants>) {
  return (
    <div
      data-slot="attachment-media"
      data-variant={variant}
      className={cn(attachmentMediaVariants({ variant }), className)}
      {...props}
    />
  )
}

function AttachmentContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="attachment-content"
      className={cn('min-w-0 max-w-full flex-1 pr-1 leading-tight group-data-[orientation=vertical]/attachment:px-1', className)}
      {...props}
    />
  )
}

function AttachmentTitle({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="attachment-title"
      className={cn(
        // Shimmers while uploading/processing — see chat-styles.tsx.
        'block min-w-0 max-w-full truncate font-medium',
        className,
      )}
      {...props}
    />
  )
}

function AttachmentDescription({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="attachment-description"
      className={cn(
        'mt-0.5 block min-w-0 max-w-full truncate text-xs text-muted-foreground group-data-[state=error]/attachment:text-destructive/80',
        className,
      )}
      {...props}
    />
  )
}

function AttachmentActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn(
        'relative z-20 flex shrink-0 items-center group-data-[orientation=vertical]/attachment:absolute group-data-[orientation=vertical]/attachment:right-1 group-data-[orientation=vertical]/attachment:top-1 group-data-[orientation=vertical]/attachment:gap-1',
        className,
      )}
      {...props}
    />
  )
}

function AttachmentAction({ className, type = 'button', ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="attachment-action"
      type={type}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[orientation=vertical]/attachment:bg-background/90 group-data-[orientation=vertical]/attachment:shadow-sm [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  )
}

/** Makes the whole card clickable (e.g. open an image preview). */
function AttachmentTrigger({ className, type = 'button', ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="attachment-trigger"
      type={type}
      className={cn('absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      {...props}
    />
  )
}

function AttachmentGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="attachment-group"
      className={cn('flex min-w-0 flex-wrap gap-2', className)}
      {...props}
    />
  )
}

export {
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
}
