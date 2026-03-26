import { teachers, leaveRequests, bonuses, appSettings, classEvents, dropdownOptions, type Teacher, type InsertTeacher, type LeaveRequest, type InsertLeaveRequest, type UpdateLeaveRequest, type Bonus, type InsertBonus, type AppSetting, type ClassEvent, type InsertClassEvent, type DropdownOption, type InsertDropdownOption } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, or, isNull, asc } from "drizzle-orm";

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

  // Dropdown Options
  getDropdownOptions(): Promise<DropdownOption[]>;
  createDropdownOption(option: InsertDropdownOption): Promise<DropdownOption>;
  updateDropdownOption(id: string, updates: Partial<InsertDropdownOption>): Promise<DropdownOption | undefined>;
  deleteDropdownOption(id: string): Promise<boolean>;
  reorderDropdownOptions(ids: string[]): Promise<void>;

  // App Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // Class Events
  getClassEventsByTeacherAndRange(teacherId: string, start: Date, end: Date): Promise<ClassEvent[]>;
  getAllClassEventsInRange(start: Date, end: Date): Promise<Array<ClassEvent & { teacherName: string; teacherCalendarId: string | null }>>;
  createClassEvent(event: InsertClassEvent): Promise<ClassEvent>;
  upsertClassEventByGoogleId(googleEventId: string, event: InsertClassEvent): Promise<ClassEvent>;
  updateClassEvent(id: string, updates: Partial<InsertClassEvent>): Promise<ClassEvent | undefined>;
  updateClassEventByGoogleId(googleEventId: string, updates: Partial<InsertClassEvent>): Promise<ClassEvent | undefined>;
  deleteClassEvent(id: string): Promise<boolean>;
  deleteClassEventByGoogleId(googleEventId: string): Promise<boolean>;
  getClassEventsByGroupId(groupId: string): Promise<ClassEvent[]>;
  getClassEventsByTitleAndTeacher(teacherId: string, title: string): Promise<ClassEvent[]>;
  deleteClassEventsByGroupId(groupId: string): Promise<number>;
  deleteClassEventsByTitleAndTeacher(teacherId: string, title: string): Promise<number>;
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

  // Dropdown Options
  async getDropdownOptions(): Promise<DropdownOption[]> {
    return db.select().from(dropdownOptions).orderBy(asc(dropdownOptions.sortOrder), asc(dropdownOptions.createdAt));
  }

  async createDropdownOption(option: InsertDropdownOption): Promise<DropdownOption> {
    const [created] = await db.insert(dropdownOptions).values(option).returning();
    return created;
  }

  async updateDropdownOption(id: string, updates: Partial<InsertDropdownOption>): Promise<DropdownOption | undefined> {
    const [updated] = await db.update(dropdownOptions).set(updates).where(eq(dropdownOptions.id, id)).returning();
    return updated;
  }

  async deleteDropdownOption(id: string): Promise<boolean> {
    const result = await db.delete(dropdownOptions).where(eq(dropdownOptions.id, id)).returning();
    return result.length > 0;
  }

  async reorderDropdownOptions(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      await db.update(dropdownOptions).set({ sortOrder: i }).where(eq(dropdownOptions.id, ids[i]));
    }
  }

  // App Settings
  async getSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row ? row.value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  // Class Events
  async getClassEventsByTeacherAndRange(teacherId: string, start: Date, end: Date): Promise<ClassEvent[]> {
    return db.select().from(classEvents).where(
      and(
        eq(classEvents.teacherId, teacherId),
        gte(classEvents.startDateTime, start),
        lte(classEvents.startDateTime, end),
      )
    );
  }

  async getAllClassEventsInRange(start: Date, end: Date): Promise<Array<ClassEvent & { teacherName: string; teacherCalendarId: string | null }>> {
    const rows = await db
      .select({
        id: classEvents.id,
        teacherId: classEvents.teacherId,
        calendarId: classEvents.calendarId,
        googleEventId: classEvents.googleEventId,
        title: classEvents.title,
        description: classEvents.description,
        startDateTime: classEvents.startDateTime,
        endDateTime: classEvents.endDateTime,
        colorId: classEvents.colorId,
        backgroundColor: classEvents.backgroundColor,
        isAvailabilityBlock: classEvents.isAvailabilityBlock,
        isRecurring: classEvents.isRecurring,
        recurrenceGroupId: classEvents.recurrenceGroupId,
        recurrenceRule: classEvents.recurrenceRule,
        createdAt: classEvents.createdAt,
        updatedAt: classEvents.updatedAt,
        teacherName: teachers.name,
        teacherCalendarId: teachers.calendarId,
      })
      .from(classEvents)
      .innerJoin(teachers, eq(classEvents.teacherId, teachers.id))
      .where(
        and(
          gte(classEvents.startDateTime, start),
          lte(classEvents.startDateTime, end),
        )
      );
    return rows;
  }

  async createClassEvent(event: InsertClassEvent): Promise<ClassEvent> {
    const [created] = await db.insert(classEvents).values({ ...event, updatedAt: new Date() }).returning();
    return created;
  }

  async upsertClassEventByGoogleId(googleEventId: string, event: InsertClassEvent): Promise<ClassEvent> {
    const [upserted] = await db
      .insert(classEvents)
      .values({ ...event, googleEventId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: classEvents.googleEventId,
        set: {
          title: event.title,
          description: event.description,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          colorId: event.colorId,
          backgroundColor: event.backgroundColor,
          isAvailabilityBlock: event.isAvailabilityBlock,
          isRecurring: event.isRecurring,
          recurrenceRule: event.recurrenceRule,
          calendarId: event.calendarId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async updateClassEvent(id: string, updates: Partial<InsertClassEvent>): Promise<ClassEvent | undefined> {
    const [updated] = await db
      .update(classEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(classEvents.id, id))
      .returning();
    return updated;
  }

  async updateClassEventByGoogleId(googleEventId: string, updates: Partial<InsertClassEvent>): Promise<ClassEvent | undefined> {
    const [updated] = await db
      .update(classEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(classEvents.googleEventId, googleEventId))
      .returning();
    return updated;
  }

  async deleteClassEvent(id: string): Promise<boolean> {
    const result = await db.delete(classEvents).where(eq(classEvents.id, id)).returning();
    return result.length > 0;
  }

  async deleteClassEventByGoogleId(googleEventId: string): Promise<boolean> {
    const result = await db.delete(classEvents).where(eq(classEvents.googleEventId, googleEventId)).returning();
    return result.length > 0;
  }

  async getClassEventsByGroupId(groupId: string): Promise<ClassEvent[]> {
    return db.select().from(classEvents).where(eq(classEvents.recurrenceGroupId, groupId));
  }

  async getClassEventsByTitleAndTeacher(teacherId: string, title: string): Promise<ClassEvent[]> {
    return db.select().from(classEvents).where(and(eq(classEvents.teacherId, teacherId), eq(classEvents.title, title)));
  }

  async deleteClassEventsByGroupId(groupId: string): Promise<number> {
    const result = await db.delete(classEvents).where(eq(classEvents.recurrenceGroupId, groupId)).returning();
    return result.length;
  }

  async deleteClassEventsByTitleAndTeacher(teacherId: string, title: string): Promise<number> {
    const result = await db.delete(classEvents).where(and(eq(classEvents.teacherId, teacherId), eq(classEvents.title, title))).returning();
    return result.length;
  }
}

export const storage = new DatabaseStorage();
