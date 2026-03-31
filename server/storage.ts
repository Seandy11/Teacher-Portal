import { teachers, leaveRequests, bonuses, type Teacher, type InsertTeacher, type LeaveRequest, type InsertLeaveRequest, type UpdateLeaveRequest, type Bonus, type InsertBonus } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

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
  getAllBonuses(): Promise<Bonus[]>;
  getBonusesByTeacherAndMonth(teacherId: string, month: string): Promise<Bonus[]>;
  getBonusesByTeacher(teacherId: string): Promise<Bonus[]>;
  createBonus(bonus: InsertBonus): Promise<Bonus>;
  deleteBonus(id: string): Promise<boolean>;
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
  async getAllBonuses(): Promise<Bonus[]> {
    return db.select().from(bonuses);
  }

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
}

export const storage = new DatabaseStorage();
