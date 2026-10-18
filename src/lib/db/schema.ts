import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  googleSub: text("google_sub").unique(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AttemptStatus = "active" | "grading" | "followup" | "complete" | "abandoned";

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    status: text("status").$type<AttemptStatus>().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: integer("score"),
    verdict: text("verdict"),
    hiddenPassed: integer("hidden_passed"),
    hiddenTotal: integer("hidden_total"),
    report: jsonb("report"),
    followup: jsonb("followup"),
    submission: jsonb("submission"),
    tokens: integer("tokens").notNull().default(0),
  },
  (t) => [index("attempts_user_idx").on(t.userId, t.slug)],
);

export const usage = pgTable(
  "usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    tokens: integer("tokens").notNull().default(0),
    requests: integer("requests").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export type User = typeof users.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
