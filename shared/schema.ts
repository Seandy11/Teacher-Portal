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
  month: varchar("month").notNull(), // Format: YYYY-MM
  createdBy: varchar("created_by"), // Admin user ID who created the bonus
  createdAt: timestamp("created_at").defaultNow(),
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

// Calendar event types (not stored in DB, from Google Calendar)
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  isAvailabilityBlock: boolean; // true = availability block (editable), false = class (read-only)
}

// Attendance row type (from Google Sheets)
// Structure: A=No., B=Date, C=Lesson details (editable), D=Teacher, E=Lesson time purchased, F=Lesson duration, G=Remaining time, H=Notes
export interface AttendanceRow {
  rowIndex: number;
  lessonNo: string; // Column A - lesson number
  date: string; // Column B
  lessonDetails: string; // Column C - EDITABLE (dropdown or free text)
  teacher: string; // Column D - read-only
  lessonTimePurchased: string; // Column E - read-only
  lessonDuration: string; // Column F - read-only
  remainingTime: string; // Column G - read-only
  notes: string; // Column H - read-only
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
