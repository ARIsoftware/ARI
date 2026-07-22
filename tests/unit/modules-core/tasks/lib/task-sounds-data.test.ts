import { describe, it, expect } from 'vitest'
import { TASK_SOUND_DATA } from '@/modules-core/tasks/lib/task-sounds-data'
import type { TaskSoundName } from '@/modules-core/tasks/lib/task-sounds-data'

const EXPECTED_SOUNDS: TaskSoundName[] = [
  'add', 'complete', 'uncomplete', 'delete', 'edit',
  'tap', 'hover', 'tab', 'button', 'panel',
]

describe('TASK_SOUND_DATA shape', () => {
  it('exports an object with all expected sound names', () => {
    for (const name of EXPECTED_SOUNDS) {
      expect(TASK_SOUND_DATA).toHaveProperty(name)
    }
  })

  it('every value is a non-empty data URI string starting with "data:audio/"', () => {
    for (const name of EXPECTED_SOUNDS) {
      const value = TASK_SOUND_DATA[name]
      expect(typeof value).toBe('string')
      expect(value.startsWith('data:audio/')).toBe(true)
    }
  })

  it('data URIs contain base64-encoded content', () => {
    for (const name of EXPECTED_SOUNDS) {
      expect(TASK_SOUND_DATA[name]).toContain('base64,')
    }
  })

  it('has exactly the expected number of sounds (10)', () => {
    expect(Object.keys(TASK_SOUND_DATA)).toHaveLength(EXPECTED_SOUNDS.length)
  })
})
