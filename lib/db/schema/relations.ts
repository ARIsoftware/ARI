import { relations } from "drizzle-orm/relations";
import {
  tasks,
  majorProjects,
  hyroxWorkouts,
  hyroxWorkoutStations,
  contributionGraph,
  winterArcGoals,
  knowledgeArticles,
  knowledgeCollections,
  user,
  session,
  account
} from "./schema";

// Tasks -> Major Projects (one-to-many)
export const tasksRelations = relations(tasks, ({one}) => ({
  majorProject: one(majorProjects, {
    fields: [tasks.projectId],
    references: [majorProjects.id]
  }),
}));

export const majorProjectsRelations = relations(majorProjects, ({many}) => ({
  tasks: many(tasks),
}));

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

// Contribution Graph -> Winter Arc Goals (many-to-one)
export const contributionGraphRelations = relations(contributionGraph, ({one}) => ({
  winterArcGoal: one(winterArcGoals, {
    fields: [contributionGraph.goalId],
    references: [winterArcGoals.id]
  }),
}));

export const winterArcGoalsRelations = relations(winterArcGoals, ({many}) => ({
  contributionGraphs: many(contributionGraph),
}));

// Knowledge Articles -> Collections (many-to-one)
export const knowledgeArticlesRelations = relations(knowledgeArticles, ({one}) => ({
  knowledgeCollection: one(knowledgeCollections, {
    fields: [knowledgeArticles.collectionId],
    references: [knowledgeCollections.id]
  }),
}));

export const knowledgeCollectionsRelations = relations(knowledgeCollections, ({many}) => ({
  knowledgeArticles: many(knowledgeArticles),
}));

// Better Auth tables
export const sessionRelations = relations(session, ({one}) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id]
  }),
}));

export const userRelations = relations(user, ({many}) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const accountRelations = relations(account, ({one}) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id]
  }),
}));
