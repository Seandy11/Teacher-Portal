import { teachers, leaveRequests, bonuses, students, lessonRecords, type Teacher, type InsertTeacher, type LeaveRequest, type InsertLeaveRequest, type UpdateLeaveRequest, type Bonus, type InsertBonus, type Student, type InsertStudent, type LessonRecord, type InsertLessonRecord } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  // Teachers
  getTeacher(id: string): Promise<Teacher | undefined>;
  getTeacherByUserId(userId: string): Promise<Teacher | undefined>;
  getTeacherByEmail(email: string): Promise<Teacher | undefined>;
  getAllTeachers(): Promise<Teacher[]>;
  createTeacher(teacher: InsertTeacher): Promise<Teacher>;
  updateTeacher(id: string, updates: Partial<InsertTeacher>): Promise<Teacher | undefined>;
  deleteTeacher(id: string): Promise<boolean>;
  
  // Leave Requests
  getLeaveRequest(id: string): Promise<LeaveRequest | undefined>;
  getLeaveRequestsByTeacher(teacherId: string): Promise<LeaveRequest[]>;
  getAllLeaveRequests(): Promise<LeaveRequest[]>;
  createLeaveRequest(request: InsertLeaveRequest): Promise<LeaveRequest>;
  updateLeaveRequest(id: string, updates: UpdateLeaveRequest): Promise<LeaveRequest | undefined>;
  
  // Bonuses
  getBonusesByTeacherAndMonth(teacherId: string, month: string): Promise<Bonus[]>;
  getBonusesByTeacher(teacherId: string): Promise<Bonus[]>;
  createBonus(bonus: InsertBonus): Promise<Bonus>;
  deleteBonus(id: string): Promise<boolean>;

  // Students
  getStudentsByTeacher(teacherId: string): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, updates: Partial<InsertStudent>): Promise<Student | undefined>;
  deleteStudent(id: string): Promise<boolean>;

  // Lesson Records
  getLessonRecordsByStudent(studentId: string): Promise<LessonRecord[]>;
  getLessonRecord(id: string): Promise<LessonRecord | undefined>;
  createLessonRecord(record: InsertLessonRecord): Promise<LessonRecord>;
  bulkCreateLessonRecords(records: InsertLessonRecord[]): Promise<LessonRecord[]>;
  updateLessonRecord(id: string, updates: Partial<InsertLessonRecord>): Promise<LessonRecord | undefined>;
  deleteLessonRecord(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Teachers
  async getTeacher(id: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.id, id));
    return teacher;
  }

  async getTeacherByUserId(userId: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, userId));
    return teacher;
  }

  async getTeacherByEmail(email: string): Promise<Teacher | undefined> {
    const [teacher] = await db.select().from(teachers).where(eq(teachers.email, email));
    return teacher;
  }

  async getAllTeachers(): Promise<Teacher[]> {
    return db.select().from(teachers);
  }

  async createTeacher(teacher: InsertTeacher): Promise<Teacher> {
    const [created] = await db.insert(teachers).values(teacher).returning();
    return created;
  }

  async updateTeacher(id: string, updates: Partial<InsertTeacher>): Promise<Teacher | undefined> {
    const [updated] = await db
      .update(teachers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teachers.id, id))
      .returning();
    return updated;
  }

  async deleteTeacher(id: string): Promise<boolean> {
    const result = await db.delete(teachers).where(eq(teachers.id, id)).returning();
    return result.length > 0;
  }

  // Leave Requests
  async getLeaveRequest(id: string): Promise<LeaveRequest | undefined> {
    const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
    return request;
  }

  async getLeaveRequestsByTeacher(teacherId: string): Promise<LeaveRequest[]> {
    return db.select().from(leaveRequests).where(eq(leaveRequests.teacherId, teacherId));
  }

  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    return db.select().from(leaveRequests);
  }

  async createLeaveRequest(request: InsertLeaveRequest): Promise<LeaveRequest> {
    const [created] = await db.insert(leaveRequests).values(request).returning();
    return created;
  }

  async updateLeaveRequest(id: string, updates: UpdateLeaveRequest): Promise<LeaveRequest | undefined> {
    const [updated] = await db
      .update(leaveRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leaveRequests.id, id))
      .returning();
    return updated;
  }

  // Bonuses
  async getBonusesByTeacherAndMonth(teacherId: string, month: string): Promise<Bonus[]> {
    return db.select().from(bonuses).where(
      and(eq(bonuses.teacherId, teacherId), eq(bonuses.month, month))
    );
  }

  async getBonusesByTeacher(teacherId: string): Promise<Bonus[]> {
    return db.select().from(bonuses).where(eq(bonuses.teacherId, teacherId));
  }

  async createBonus(bonus: InsertBonus): Promise<Bonus> {
    const [created] = await db.insert(bonuses).values(bonus).returning();
    return created;
  }

  async deleteBonus(id: string): Promise<boolean> {
    const result = await db.delete(bonuses).where(eq(bonuses.id, id)).returning();
    return result.length > 0;
  }

  // Students
  async getStudentsByTeacher(teacherId: string): Promise<Student[]> {
    return db.select().from(students).where(eq(students.teacherId, teacherId));
  }

  async getStudent(id: string): Promise<Student | undefined> {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student;
  }

  async createStudent(student: InsertStudent): Promise<Student> {
    const [created] = await db.insert(students).values(student).returning();
    return created;
  }

  async updateStudent(id: string, updates: Partial<InsertStudent>): Promise<Student | undefined> {
    const [updated] = await db
      .update(students)
      .set(updates)
      .where(eq(students.id, id))
      .returning();
    return updated;
  }

  async deleteStudent(id: string): Promise<boolean> {
    await db.delete(lessonRecords).where(eq(lessonRecords.studentId, id));
    const result = await db.delete(students).where(eq(students.id, id)).returning();
    return result.length > 0;
  }

  // Lesson Records
  async getLessonRecordsByStudent(studentId: string): Promise<LessonRecord[]> {
    return db.select().from(lessonRecords).where(eq(lessonRecords.studentId, studentId));
  }

  async getLessonRecord(id: string): Promise<LessonRecord | undefined> {
    const [record] = await db.select().from(lessonRecords).where(eq(lessonRecords.id, id));
    return record;
  }

  async createLessonRecord(record: InsertLessonRecord): Promise<LessonRecord> {
    const [created] = await db.insert(lessonRecords).values(record).returning();
    return created;
  }

  async bulkCreateLessonRecords(records: InsertLessonRecord[]): Promise<LessonRecord[]> {
    if (records.length === 0) return [];
    return db.insert(lessonRecords).values(records).returning();
  }

  async updateLessonRecord(id: string, updates: Partial<InsertLessonRecord>): Promise<LessonRecord | undefined> {
    const [updated] = await db
      .update(lessonRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(lessonRecords.id, id))
      .returning();
    return updated;
  }

  async deleteLessonRecord(id: string): Promise<boolean> {
    const result = await db.delete(lessonRecords).where(eq(lessonRecords.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
