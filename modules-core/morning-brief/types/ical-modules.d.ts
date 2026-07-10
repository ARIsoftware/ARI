/**
 * Minimal ambient types for `ical.js` (v1.5, ships no types of its own).
 *
 * Only the surface that `ical-expander`'s own `index.d.ts` references and that
 * `lib/ical.ts` actually uses is declared here — just enough for type-checking,
 * not a full binding.
 */
declare module 'ical.js' {
  namespace ICAL {
    interface Time {
      /** True for all-day (date-only) values. */
      isDate: boolean
      toJSDate(): Date
      toUnixTime(): number
    }

    interface OccurrenceDetails {
      recurrenceId: Time
      startDate: Time
      endDate: Time
      /** The parent VEVENT this occurrence was expanded from. */
      item: Event
    }

    interface Event {
      uid: string
      summary: string
      location: string
      startDate: Time
      endDate: Time
      getOccurrenceDetails(occurrence: Time): OccurrenceDetails
    }
  }

  export = ICAL
}
