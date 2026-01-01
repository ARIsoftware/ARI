/**
 * Fitness Task Management
 *
 * This file re-exports fitness functions from the daily-fitness module
 * to maintain backward compatibility with existing pages.
 */

export {
  getFitnessTasks,
  createFitnessTask,
  updateFitnessTask,
  deleteFitnessTask,
  toggleFitnessTaskCompletion,
  toggleFitnessTaskStar,
  reorderFitnessTasks,
  addSampleFitnessTasks,
  type FitnessTask
} from '@/modules/daily-fitness/lib/fitness'
