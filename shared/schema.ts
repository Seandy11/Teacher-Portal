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

// Students table - each student belongs to a teacher
export const students = pgTable("students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull().references(() => teachers.id),
  name: varchar("name").notNull(),
  courseName: varchar("course_name"),
  sheetTab: varchar("sheet_tab"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Lesson records table - attendance/tracking data owned by the app
export const lessonRecords = pgTable("lesson_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teacherId: varchar("teacher_id").notNull().references(() => teachers.id),
  studentId: varchar("student_id").notNull().references(() => students.id),
  lessonNo: varchar("lesson_no"),
  date: varchar("date"),
  lessonDetails: text("lesson_details"),
  teacher: varchar("teacher_name"),
  lessonTimePurchased: varchar("lesson_time_purchased"),
  lessonDuration: varchar("lesson_duration"),
  remainingTime: varchar("remaining_time"),
  referralCredits: varchar("referral_credits"),
  notes: text("notes"),
  dropdownOptions: text("dropdown_options").array(),
  sheetRowIndex: integer("sheet_row_index"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const teachersRelations = relations(teachers, ({ many }) => ({
  leaveRequests: many(leaveRequests),
  bonuses: many(bonuses),
  students: many(students),
  lessonRecords: many(lessonRecords),
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

export const studentsRelations = relations(students, ({ one, many }) => ({
  teacher: one(teachers, {
    fields: [students.teacherId],
    references: [teachers.id],
  }),
  lessonRecords: many(lessonRecords),
}));

export const lessonRecordsRelations = relations(lessonRecords, ({ one }) => ({
  teacher: one(teachers, {
    fields: [lessonRecords.teacherId],
    references: [teachers.id],
  }),
  student: one(students, {
    fields: [lessonRecords.studentId],
    references: [students.id],
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

// Student insert schema
export const insertStudentSchema = createInsertSchema(students).omit({
  id: true,
  createdAt: true,
});

// Lesson record insert schema
export const insertLessonRecordSchema = createInsertSchema(lessonRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Teacher = typeof teachers.$inferSelect;
export type InsertTeacher = z.infer<typeof insertTeacherSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;
export type UpdateLeaveRequest = z.infer<typeof updateLeaveRequestSchema>;
export type Bonus = typeof bonuses.$inferSelect;
export type InsertBonus = z.infer<typeof insertBonusSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type LessonRecord = typeof lessonRecords.$inferSelect;
export type InsertLessonRecord = z.infer<typeof insertLessonRecordSchema>;

// Calendar event types (not stored in DB, from Google Calendar)
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  isAvailabilityBlock: boolean; // true = availability block (editable), false = class (read-only)
  colorId?: string; // Google Calendar color ID
  backgroundColor?: string; // Resolved background color
}

// Attendance row type (from Google Sheets)
// Structure: A=No., B=Date, C=Lesson details (editable), D=Teacher, E=Lesson time purchased, F=Lesson duration, G=Remaining time, H=Referral credits, I=Notes & Parent Feedback
export interface AttendanceRow {
  rowIndex: number;
  recordId?: string;
  lessonNo: string;
  date: string;
  lessonDetails: string;
  teacher: string;
  lessonTimePurchased: string;
  lessonDuration: string;
  remainingTime: string;
  referralCredits: string;
  notes: string;
  dropdownOptions?: string[];
}

// Sheet tab info
export interface SheetTab {
  name: string;
  sheetId: number;
  studentId?: string;
  courseName?: string;
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
