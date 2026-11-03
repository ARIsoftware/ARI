/**
 * shadcn/ui Marker (June 2026 chat components), adapted to ARI's Tailwind 3
 * tokens: status lines ("Thinking…", "Stopped") and labelled separators
 * (day breaks) inside a conversation.
 */

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const markerVariants = cva(
  "group/marker relative flex min-h-4 w-full items-center gap-2 text-left text-sm text-muted-foreground [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: '',
        separator:
          "text-xs font-medium before:mr-1 before:h-px before:min-w-0 before:flex-1 before:bg-border before:content-[''] after:ml-1 after:h-px after:min-w-0 after:flex-1 after:bg-border after:content-['']",
        border: 'border-b border-border pb-2',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Marker({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof markerVariants>) {
  return (
    <div
      data-slot="marker"
      data-variant={variant}
      className={cn(markerVariants({ variant }), className)}
      {...props}
    />
  )
}

function MarkerIcon({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    />
  )
}

function MarkerContent({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="marker-content"
      className={cn('min-w-0 break-words group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center', className)}
      {...props}
    />
  )
}

export { Marker, MarkerIcon, MarkerContent, markerVariants }
