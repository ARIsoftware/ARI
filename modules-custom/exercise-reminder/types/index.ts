export interface ExerciseReminderSettings {
  enabled: boolean
  message: string
  countdownDuration: number // minutes (1-30)
  triggerMinute: number // minute past the hour (0-59)
  dismissable: boolean
}

export const DEFAULT_SETTINGS: ExerciseReminderSettings = {
  enabled: true,
  message: 'Time for your 10 minute exercise break!',
  countdownDuration: 2,
  triggerMinute: 50,
  dismissable: false,
}
