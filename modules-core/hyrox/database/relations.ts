import { relations } from "drizzle-orm/relations";
import { hyroxWorkouts, hyroxWorkoutStations } from "@/lib/db/schema";

// HYROX Workouts -> Workout Stations (one-to-many)
export const hyroxWorkoutsRelations = relations(hyroxWorkouts, ({many}) => ({
  hyroxWorkoutStations: many(hyroxWorkoutStations),
}));

export const hyroxWorkoutStationsRelations = relations(hyroxWorkoutStations, ({one}) => ({
  hyroxWorkout: one(hyroxWorkouts, {
    fields: [hyroxWorkoutStations.workoutId],
    references: [hyroxWorkouts.id]
  }),
}));
