import { relations } from "drizzle-orm/relations";
import { knowledgeArticles, knowledgeCollections } from "./schema";

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
