import {
  pgTable,
  index,
  pgPolicy,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  date,
  doublePrecision,
  jsonb,
  check,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const rlsPolicies = (prefix: string) => [
  pgPolicy(`${prefix}_rls_select`, { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy(`${prefix}_rls_insert`, { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy(`${prefix}_rls_update`, { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
  pgPolicy(`${prefix}_rls_delete`, { as: "permissive", for: "delete", to: ["public"], using: sql`(user_id = (select current_setting('app.current_user_id')))` }),
]

export const healthDataImports = pgTable("health_data_imports", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  status: text().notNull().default("processing"),
  progress: integer().notNull().default(0),
  phase: text(),
  recordsParsed: bigint("records_parsed", { mode: "number" }).notNull().default(0),
  error: text(),
  // Parser-origin local time (ISO 8601 with offset, e.g. "2024-01-15T20:30:00-05:00").
  // Stored as text verbatim so the device-local wall clock is preserved.
  exportDate: text("export_date"),
  locale: text(),
  profile: jsonb(),
  clinical: jsonb(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  index("idx_health_data_imports_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
  index("idx_health_data_imports_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
  check("health_data_imports_status_check", sql`status IN ('processing', 'completed', 'failed')`),
  ...rlsPolicies("health_data_imports"),
])

export const healthDataDailyMetrics = pgTable("health_data_daily_metrics", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  metricType: text("metric_type").notNull(),
  metricDate: date("metric_date").notNull(),
  unit: text(),
  valueSum: doublePrecision("value_sum"),
  valueMin: doublePrecision("value_min"),
  valueMax: doublePrecision("value_max"),
  valueAvg: doublePrecision("value_avg"),
  sampleCount: integer("sample_count").notNull().default(0),
}, (table) => [
  index("idx_health_data_daily_metrics_user_type_date").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.metricType.asc().nullsLast().op("text_ops"), table.metricDate.asc().nullsLast().op("date_ops")),
  index("idx_health_data_daily_metrics_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_daily_metrics"),
])

export const healthDataWorkouts = pgTable("health_data_workouts", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(),
  // Parser-origin local time (ISO 8601 with offset) stored as text verbatim
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  durationMin: doublePrecision("duration_min"),
  distanceKm: doublePrecision("distance_km"),
  energyKcal: doublePrecision("energy_kcal"),
  avgHeartRate: doublePrecision("avg_heart_rate"),
  maxHeartRate: doublePrecision("max_heart_rate"),
  elevationGainM: doublePrecision("elevation_gain_m"),
  sourceName: text("source_name"),
}, (table) => [
  index("idx_health_data_workouts_user_start").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.startTime.desc().nullsFirst().op("text_ops")),
  index("idx_health_data_workouts_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_workouts"),
])

export const healthDataActivityDays = pgTable("health_data_activity_days", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  day: date().notNull(),
  activeEnergy: doublePrecision("active_energy"),
  activeEnergyGoal: doublePrecision("active_energy_goal"),
  exerciseMinutes: doublePrecision("exercise_minutes"),
  exerciseGoal: doublePrecision("exercise_goal"),
  standHours: doublePrecision("stand_hours"),
  standGoal: doublePrecision("stand_goal"),
}, (table) => [
  index("idx_health_data_activity_days_user_day").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.day.asc().nullsLast().op("date_ops")),
  index("idx_health_data_activity_days_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_activity_days"),
])

export const healthDataSleepNights = pgTable("health_data_sleep_nights", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  nightDate: date("night_date").notNull(),
  // Parser-origin local time (ISO 8601 with offset) stored as text verbatim
  startTime: text("start_time"),
  endTime: text("end_time"),
  inBedMin: doublePrecision("in_bed_min"),
  asleepMin: doublePrecision("asleep_min"),
  coreMin: doublePrecision("core_min"),
  deepMin: doublePrecision("deep_min"),
  remMin: doublePrecision("rem_min"),
  awakeMin: doublePrecision("awake_min"),
}, (table) => [
  index("idx_health_data_sleep_nights_user_date").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.nightDate.asc().nullsLast().op("date_ops")),
  index("idx_health_data_sleep_nights_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_sleep_nights"),
])

export const healthDataRoutes = pgTable("health_data_routes", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  routeDate: date("route_date").notNull(),
  // Parser-origin GPX timestamp (ISO 8601) stored as text verbatim
  startedAt: text("started_at"),
  distanceKm: doublePrecision("distance_km"),
  durationMin: doublePrecision("duration_min"),
  pointCount: integer("point_count").notNull().default(0),
  points: jsonb(),
}, (table) => [
  index("idx_health_data_routes_user_date").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.routeDate.asc().nullsLast().op("date_ops")),
  index("idx_health_data_routes_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_routes"),
])

export const healthDataEcgs = pgTable("health_data_ecgs", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: text("user_id").notNull(),
  importId: uuid("import_id").notNull().references(() => healthDataImports.id, { onDelete: "cascade" }),
  // Parser-origin local time (ISO 8601 with offset) stored as text verbatim
  recordedAt: text("recorded_at"),
  classification: text(),
  symptoms: text(),
  averageHeartRate: doublePrecision("average_heart_rate"),
  samplingFrequencyHz: doublePrecision("sampling_frequency_hz"),
  sampleCount: integer("sample_count"),
  durationSec: doublePrecision("duration_sec"),
  device: text(),
  waveform: jsonb(),
  waveformFull: jsonb("waveform_full"),
}, (table) => [
  index("idx_health_data_ecgs_user_recorded").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.recordedAt.desc().nullsFirst().op("text_ops")),
  index("idx_health_data_ecgs_import_id").using("btree", table.importId.asc().nullsLast().op("uuid_ops")),
  ...rlsPolicies("health_data_ecgs"),
])
