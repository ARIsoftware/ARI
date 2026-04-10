import { relations } from "drizzle-orm/relations";
import { user, session, account, apiKeys, apiKeyUsageLogs } from "./core-schema";

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
  apiKeys: many(apiKeys),
}));

export const accountRelations = relations(account, ({one}) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id]
  }),
}));

// API Key tables
export const apiKeysRelations = relations(apiKeys, ({one, many}) => ({
  user: one(user, {
    fields: [apiKeys.userId],
    references: [user.id]
  }),
  usageLogs: many(apiKeyUsageLogs),
}));

export const apiKeyUsageLogsRelations = relations(apiKeyUsageLogs, ({one}) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyUsageLogs.apiKeyId],
    references: [apiKeys.id]
  }),
}));
