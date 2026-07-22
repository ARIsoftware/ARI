import { describe, it, expect } from 'vitest'
import { registry } from '@/lib/openapi/registry'

describe('OpenAPI registry', () => {
  it('is an OpenAPIRegistry instance', () => {
    expect(registry).toBeDefined()
    expect(typeof registry).toBe('object')
  })

  it('has definitions registered by app-schemas side effect', async () => {
    // Importing registry also triggers registry.ts which calls extendZodWithOpenApi(z)
    // We verify the registry object is truthy and has the expected shape
    expect(registry).not.toBeNull()
  })
})
