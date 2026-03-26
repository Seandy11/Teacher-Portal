import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, date, pgEnum, integer, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Role enum for user roles
export const roleEnum = pgEnum("role", ["teacher", "admin"]);

// Leave status enum
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);

// Teachers table - extends base user info with teacher-specific data
export const teachers = pgTable("teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").unique(), // Links to users table from auth (null until first login)
  email: varchar("email").notNull().unique(),
  name: varchar("name").notNull(),
  role: roleEnum("role").notNull().default("teacher"),
  calendarId: varchar("calendar_id"), // Google Calendar ID assigned to this teacher
  sheetId: varchar("sheet_id"), // Google Sheet ID for attendance
  sheetRowStart: varchar("sheet_row_start"), // Starting row in the sheet for this teacher
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // Teacher's hourly pay rate
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Bonuses table - admin-added bonuses for teachers
export const bonuses = pgTable("bonuses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull().references(() => teachers.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  category: varchar("category"), // assessment | training | referral | retention | demo | other
  month: varchar("month").notNull(), // Format: YYYY-MM
  createdBy: varchar("created_by"), // Admin user ID who created the bonus
  createdAt: timestamp("created_at").defaultNow(),
});

// App settings table - key/value store for app-wide configuration
export const appSettings = pgTable("app_settings", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leave requests table
export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull().references(() => teachers.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  leaveType: varchar("leave_type").notNull(), // sick, personal, vacation, etc.
  reason: text("reason"),
  status: leaveStatusEnum("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dropdown options table - stores lesson detail dropdown options for attendance
export const dropdownOptions = pgTable("dropdown_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  value: text("value").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDropdownOptionSchema = createInsertSchema(dropdownOptions).omit({
  id: true,
  createdAt: true,
});

export type DropdownOption = typeof dropdownOptions.$inferSelect;
export type InsertDropdownOption = z.infer<typeof insertDropdownOptionSchema>;

// Google OAuth tokens table - stores admin's Google OAuth refresh token
export const googleTokens = pgTable("google_tokens", {
  id: varchar("id").primaryKey().default("singleton"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const teachersRelations = relations(teachers, ({ many }) => ({
  leaveRequests: many(leaveRequests),
  bonuses: many(bonuses),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  teacher: one(teachers, {
    fields: [leaveRequests.teacherId],
    references: [teachers.id],
  }),
}));

export const bonusesRelations = relations(bonuses, ({ one }) => ({
  teacher: one(teachers, {
    fields: [bonuses.teacherId],
    references: [teachers.id],
  }),
}));

// Insert schemas
export const insertTeacherSchema = createInsertSchema(teachers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({
  id: true,
  status: true,
  adminNotes: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeaveRequestSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  adminNotes: z.string().optional(),
});

// Bonus insert schema
export const insertBonusSchema = createInsertSchema(bonuses).omit({
  id: true,
  createdAt: true,
});

// Types
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type UpdateLeaveRequest = z.infer<typeof updateLeaveRequestSchema>;
export type Bonus = typeof bonuses.$inferSelect;
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

export const BONUS_CATEGORIES = ["assessment", "training", "referral", "retention", "demo"] as const;
export type BonusCategory = typeof BONUS_CATEGORIES[number];

// Class events table - portal-native storage (replaces Google Calendar as source of truth)
export const classEvents = pgTable("class_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull().references(() => teachers.id),
  calendarId: varchar("calendar_id"), // Teacher's Google Calendar ID (used for sync back)
  googleEventId: varchar("google_event_id").unique(), // Google's event ID; null = portal-native event
  title: varchar("title").notNull(),
  description: text("description"),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  colorId: varchar("color_id"),
  backgroundColor: varchar("background_color"),
  isAvailabilityBlock: boolean("is_availability_block").default(false),
  isRecurring: boolean("is_recurring").default(false),
  recurrenceGroupId: varchar("recurrence_group_id"), // Links all events in a recurring series
  recurrenceRule: text("recurrence_rule"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const classEventsRelations = relations(classEvents, ({ one }) => ({
  teacher: one(teachers, { fields: [classEvents.teacherId], references: [teachers.id] }),
}));

export const insertClassEventSchema = createInsertSchema(classEvents).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type ClassEvent = typeof classEvents.$inferSelect;
export type InsertClassEvent = z.infer<typeof insertClassEventSchema>;

// Calendar event interface (the shape returned by API — compatible with both DB and Google)
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO string
  end: string;   // ISO string
  isAvailabilityBlock: boolean;
  colorId?: string;
  backgroundColor?: string;
  googleEventId?: string | null;
  calendarId?: string | null;
  isRecurring?: boolean;
  recurrenceGroupId?: string | null;
}

// Attendance row type (from Google Sheets)
// Structure: A=No., B=Date, C=Lesson details (editable), D=Teacher, E=Lesson time purchased, F=Lesson duration, G=Remaining time, H=Referral credits, I=Notes & Parent Feedback
export interface AttendanceRow {
  rowIndex: number;
  lessonNo: string; // Column A - lesson number
  date: string; // Column B
  lessonDetails: string; // Column C - EDITABLE (dropdown or free text)
  teacher: string; // Column D - read-only
  lessonTimePurchased: string; // Column E - read-only
  lessonDuration: string; // Column F - read-only
  remainingTime: string; // Column G - read-only
  referralCredits: string; // Column H - read-only
  notes: string; // Column I - read-only (Notes & Parent Feedback)
  dropdownOptions?: string[]; // Data validation options for Column C (if any)
}

// Sheet tab info
export interface SheetTab {
  name: string;
  sheetId: number;
}

// Pay summary with bonus breakdown from payroll sheet
export interface PaySummary {
  month: string;
  totalMinutes: number;
  totalHours: number;
  hourlyRate: number;
  basePay: number;
  bonuses: {
    assessment: number;
    training: number;
    referral: number;
    retention: number;
    demo: number;
    total: number;
  };
  totalPay: number;
}
