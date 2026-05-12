/**
 * Drizzle ORM schema for the university LMS.
 *
 * Tables:
 *  - users           Auth-provider-agnostic identity (Clerk, Logto, etc.)
 *  - semesters       Catalog: top-level grouping
 *  - subjects        Catalog: subject within a semester
 *  - units           Catalog: unit within a subject
 *  - lessons         Catalog: lesson within a unit → points at classrooms.id
 *  - classrooms      Generated classroom data (JSONB) + status
 *  - student_profiles Onboarding data (program, year, semester, roll_number)
 *  - student_progress Per-user per-classroom progress tracking
 */

import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// users — Auth-provider-agnostic identity
// ---------------------------------------------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authProvider: varchar('auth_provider', { length: 32 }).notNull().default('clerk'),
    authProviderId: varchar('auth_provider_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 320 }),
    displayName: varchar('display_name', { length: 255 }),
    avatarUrl: text('avatar_url'),
    /** 'student' | 'sme' | 'admin' — enforced at app level, not DB enum */
    role: varchar('role', { length: 32 }).notNull().default('student'),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('users_auth_provider_id_idx').on(table.authProvider, table.authProviderId),
  ],
);

// ---------------------------------------------------------------------------
// Catalog hierarchy: semesters → subjects → units → lessons
// ---------------------------------------------------------------------------

export const semesters = pgTable('semesters', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  number: integer('number').notNull(),
  programName: varchar('program_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('subjects_semester_id_idx').on(table.semesterId)],
);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('units_subject_id_idx').on(table.subjectId)],
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    /** FK to classrooms.id (text / nanoid) */
    classroomId: text('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    thumbnailUrl: text('thumbnail_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lessons_unit_id_idx').on(table.unitId),
    index('lessons_classroom_id_idx').on(table.classroomId),
  ],
);

// ---------------------------------------------------------------------------
// classrooms — Generated classroom data (JSONB) + publication status
// ---------------------------------------------------------------------------

export const classrooms = pgTable(
  'classrooms',
  {
    /** text PK (nanoid) — matches the existing codebase ID format */
    id: text('id').primaryKey(),
    title: varchar('title', { length: 500 }).notNull(),
    data: jsonb('data').notNull(),
    /** 'draft' | 'published' | 'archived' */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    mediaUrls: jsonb('media_urls').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('classrooms_status_idx').on(table.status)],
);

// ---------------------------------------------------------------------------
// student_profiles — Onboarding data
// ---------------------------------------------------------------------------

export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    programName: varchar('program_name', { length: 255 }),
    year: integer('year'),
    currentSemesters: jsonb('current_semesters').default(sql`'[]'::jsonb`),
    /** Unique roll number for university partnerships */
    rollNumber: varchar('roll_number', { length: 100 }).unique(),
    /** Student picks during onboarding: 'en' | 'hi' | 'hinglish' */
    preferredLanguage: varchar('preferred_language', { length: 32 }).notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // .unique() on userId already creates an index — no extra index needed
);

// ---------------------------------------------------------------------------
// student_progress — Per-user per-classroom progress
// ---------------------------------------------------------------------------

export const studentProgress = pgTable(
  'student_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    classroomId: text('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'cascade' }),
    currentScene: integer('current_scene').notNull().default(0),
    scenesCompleted: jsonb('scenes_completed').default(sql`'[]'::jsonb`),
    quizScores: jsonb('quiz_scores').default(sql`'{}'::jsonb`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('student_progress_user_classroom_idx').on(table.userId, table.classroomId),
    index('student_progress_classroom_id_idx').on(table.classroomId),
  ],
);

// ---------------------------------------------------------------------------
// enrollments — Admin-managed roll number → semester access
// ---------------------------------------------------------------------------

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rollNumber: varchar('roll_number', { length: 100 }).notNull(),
    semesterId: uuid('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    /** Which admin granted access */
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('enrollments_roll_semester_idx').on(table.rollNumber, table.semesterId),
    index('enrollments_roll_number_idx').on(table.rollNumber),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(studentProfiles, {
    fields: [users.id],
    references: [studentProfiles.userId],
  }),
  progress: many(studentProgress),
  grantedEnrollments: many(enrollments),
}));

export const semestersRelations = relations(semesters, ({ many }) => ({
  subjects: many(subjects),
  enrollments: many(enrollments),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  semester: one(semesters, {
    fields: [subjects.semesterId],
    references: [semesters.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [units.subjectId],
    references: [subjects.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one }) => ({
  unit: one(units, {
    fields: [lessons.unitId],
    references: [units.id],
  }),
  classroom: one(classrooms, {
    fields: [lessons.classroomId],
    references: [classrooms.id],
  }),
}));

export const classroomsRelations = relations(classrooms, ({ many }) => ({
  lessons: many(lessons),
  progress: many(studentProgress),
}));

export const studentProgressRelations = relations(studentProgress, ({ one }) => ({
  user: one(users, {
    fields: [studentProgress.userId],
    references: [users.id],
  }),
  classroom: one(classrooms, {
    fields: [studentProgress.classroomId],
    references: [classrooms.id],
  }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  semester: one(semesters, {
    fields: [enrollments.semesterId],
    references: [semesters.id],
  }),
  grantedByUser: one(users, {
    fields: [enrollments.grantedBy],
    references: [users.id],
  }),
}));
