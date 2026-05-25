import { z } from 'zod'
import '@/lib/openapi/registry'
import { ALL_SPECIES } from './animals'

const SpeciesSchema = z.enum(ALL_SPECIES, {
  errorMap: () => ({ message: 'Unknown species' }),
})

const AnimalSchema = z.object({
  id: z.string().min(1, 'Animal id is required').max(64, 'Animal id must be 64 characters or fewer'),
  species: SpeciesSchema,
  name: z.string().min(1, 'Name is required').max(40, 'Name must be 40 characters or fewer'),
}).openapi('HavocAnimal')

export const HavocSettingsSchema = z.object({
  initialized: z.boolean().optional(),
  animals: z.array(AnimalSchema).length(3, 'There must be exactly 3 companions').optional(),
  intensity: z.number().int().min(1).max(10).optional(),
  speed: z.number().int().min(1).max(10).optional(),
}).openapi('HavocSettings')

export const SaveSuccessSchema = z.object({
  success: z.literal(true),
}).openapi('SaveSuccess')
