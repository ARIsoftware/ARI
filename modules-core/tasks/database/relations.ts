import { relations } from "drizzle-orm/relations";
import { tasks, majorProjects } from "@/lib/db/schema";

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
