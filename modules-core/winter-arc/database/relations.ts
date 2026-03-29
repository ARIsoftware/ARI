import { relations } from "drizzle-orm/relations";
import { contributionGraph, winterArcGoals } from "@/lib/db/schema";

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
