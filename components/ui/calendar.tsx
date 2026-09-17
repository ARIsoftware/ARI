'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type OnSelectHandler } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /**
   * Show the "Today" shortcut under the grid. Single-select pickers only —
   * there's no unambiguous "today" to apply in multiple/range mode.
   */
  showTodayButton?: boolean
}

/**
 * Class names below are react-day-picker **v9** UI part names (see its `UI`
 * enum). v9 renamed most of v8's parts — head_row→weekdays, row→week,
 * cell→day, day→day_button, caption→month_caption, nav_button_*→button_*,
 * day_selected→selected — and unknown keys are ignored silently rather than
 * erroring, so a stale v8 map leaves the grid completely unstyled.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  showTodayButton = true,
  ...props
}: CalendarProps) {
  // Month is left uncontrolled until the Today button needs to jump the view;
  // from then on we own it, forwarding every change to the caller's handler. A
  // caller-supplied `month` always wins, so a fully controlled picker is
  // unaffected.
  const [internalMonth, setInternalMonth] = React.useState<Date | undefined>(undefined)
  const month = props.month ?? internalMonth

  const handleMonthChange = (next: Date) => {
    setInternalMonth(next)
    props.onMonthChange?.(next)
  }

  // Narrowed once here: only the single-select members of the props union carry
  // an onSelect that takes a lone Date, and only they get the Today shortcut.
  // Typed as OnSelectHandler<Date> — we always hand it a real date, and a
  // handler accepting `Date | undefined` is assignable to one accepting `Date`.
  const singleOnSelect: OnSelectHandler<Date> | undefined =
    props.mode === 'single' ? props.onSelect : undefined

  const selectToday = (event: React.MouseEvent) => {
    const today = new Date()
    setInternalMonth(today)
    singleOnSelect?.(today, today, { today: true }, event)
  }

  return (
    <div className={cn('w-fit', className)}>
      <DayPicker
        showOutsideDays={showOutsideDays}
        month={month}
        onMonthChange={handleMonthChange}
        className="relative p-3"
        classNames={{
          months: 'flex flex-col sm:flex-row gap-4',
          month: 'space-y-4',
          // Nav is a sibling of the months in v9, so it's positioned against the
          // padded root and the arrows flank the centred caption.
          nav: 'absolute inset-x-3 top-3 flex items-center justify-between',
          button_previous: cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          ),
          button_next: cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          ),
          month_caption: 'flex h-7 items-center justify-center',
          caption_label: 'text-sm font-medium',
          month_grid: 'w-full border-collapse space-y-1',
          weekdays: 'flex',
          weekday: 'w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground',
          week: 'mt-2 flex w-full',
          day: 'relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
          day_button: cn(
            buttonVariants({ variant: 'ghost' }),
            'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
          ),
          range_end: 'day-range-end',
          selected:
            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground [&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground',
          today: 'bg-accent text-accent-foreground',
          outside:
            'day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
          disabled: 'text-muted-foreground opacity-50',
          range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
          hidden: 'invisible',
          ...classNames,
        }}
        components={{
          Chevron: ({ orientation }) =>
            orientation === 'left' ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            ),
        }}
        {...props}
      />
      {showTodayButton && singleOnSelect && (
        <div className="border-t border-border p-2">
          {/* type="button": these pickers open inside forms (e.g. the task edit
              page), where a bare button would submit on click. */}
          <button
            type="button"
            onClick={selectToday}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full font-normal')}
          >
            Today
          </button>
        </div>
      )}
    </div>
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
