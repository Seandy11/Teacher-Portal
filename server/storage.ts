import { teachers, leaveRequests, bonuses, appSettings, classEvents, dropdownOptions, students, studentPackages, studentBalanceContacts, masterSchedule, teacherRateHistory, type Teacher, type InsertTeacher, type LeaveRequest, type InsertLeaveRequest, type UpdateLeaveRequest, type Bonus, type InsertBonus, type AppSetting, type ClassEvent, type InsertClassEvent, type DropdownOption, type InsertDropdownOption, type Student, type InsertStudent, type StudentPackage, type InsertStudentPackage, type StudentBalanceContact, type InsertStudentBalanceContact, type MasterSchedule, type InsertMasterSchedule } from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, or, isNull, asc, sql, desc } from "drizzle-orm";

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

  // Rate history
  getRateForMonth(teacherId: string, month: string): Promise<number | null>;
  hasRateHistory(teacherId: string): Promise<boolean>;
  createRateHistory(teacherId: string, rate: string, effectiveMonth: string): Promise<void>;

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

  // Students
  getAllStudents(): Promise<Array<Student & { teacherName: string }>>;
  getStudentsByTeacher(teacherId: string): Promise<Student[]>;
  getStudent(id: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: string, updates: Partial<InsertStudent>): Promise<Student | undefined>;
  deleteStudent(id: string): Promise<boolean>;

  // Student Packages (top-ups)
  getPackagesByStudent(studentId: string): Promise<StudentPackage[]>;
  createStudentPackage(pkg: InsertStudentPackage): Promise<StudentPackage>;
  deleteStudentPackage(id: string): Promise<boolean>;

  // Student Balance (calculated)
  getStudentBalance(studentId: string): Promise<{ totalPurchased: number; totalUsed: number; remaining: number }>;
  getAllStudentsWithBalances(): Promise<Array<Student & { teacherName: string; totalPurchased: number; totalUsed: number; remaining: number; lastLessonDate: string | null }>>;

  // Student Balance Contacts
  getBalanceContactsByStudent(studentId: string): Promise<StudentBalanceContact[]>;
  createBalanceContact(contact: InsertStudentBalanceContact): Promise<StudentBalanceContact>;

  // Master Schedule
  getAllMasterSchedules(): Promise<Array<MasterSchedule & { studentName: string; teacherName: string }>>;
  getMasterSchedulesByStudent(studentId: string): Promise<MasterSchedule[]>;
  createMasterSchedule(schedule: InsertMasterSchedule): Promise<MasterSchedule>;
  updateMasterSchedule(id: string, updates: Partial<InsertMasterSchedule>): Promise<MasterSchedule | undefined>;
  deleteMasterSchedule(id: string): Promise<boolean>;
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

  async getAllBonuses(): Promise<Bonus[]> {
    return db.select().from(bonuses);
  }

  // Rate history
  async getRateForMonth(teacherId: string, month: string): Promise<number | null> {
    const [row] = await db
      .select()
      .from(teacherRateHistory)
      .where(and(eq(teacherRateHistory.teacherId, teacherId), lte(teacherRateHistory.effectiveMonth, month)))
      .orderBy(desc(teacherRateHistory.effectiveMonth))
      .limit(1);
    return row ? parseFloat(row.rate) : null;
  }

  async hasRateHistory(teacherId: string): Promise<boolean> {
    const [row] = await db.select().from(teacherRateHistory).where(eq(teacherRateHistory.teacherId, teacherId)).limit(1);
    return !!row;
  }

  async createRateHistory(teacherId: string, rate: string, effectiveMonth: string): Promise<void> {
    await db.insert(teacherRateHistory).values({ teacherId, rate, effectiveMonth });
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
        studentId: classEvents.studentId,
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

  // Students
  async getAllStudents(): Promise<Array<Student & { teacherName: string }>> {
    const rows = await db
      .select({ ...students, teacherName: teachers.name })
      .from(students)
      .innerJoin(teachers, eq(students.teacherId, teachers.id))
      .orderBy(asc(students.name));
    return rows as Array<Student & { teacherName: string }>;
  }

  async getStudentsByTeacher(teacherId: string): Promise<Student[]> {
    return db.select().from(students).where(eq(students.teacherId, teacherId)).orderBy(asc(students.name));
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
    const [updated] = await db.update(students).set({ ...updates, updatedAt: new Date() }).where(eq(students.id, id)).returning();
    return updated;
  }

  async deleteStudent(id: string): Promise<boolean> {
    const result = await db.delete(students).where(eq(students.id, id)).returning();
    return result.length > 0;
  }

  // Student Packages (top-ups)
  async getPackagesByStudent(studentId: string): Promise<StudentPackage[]> {
    return db.select().from(studentPackages).where(eq(studentPackages.studentId, studentId)).orderBy(desc(studentPackages.purchaseDate));
  }

  async createStudentPackage(pkg: InsertStudentPackage): Promise<StudentPackage> {
    const [created] = await db.insert(studentPackages).values(pkg).returning();
    return created;
  }

  async deleteStudentPackage(id: string): Promise<boolean> {
    const result = await db.delete(studentPackages).where(eq(studentPackages.id, id)).returning();
    return result.length > 0;
  }

  // Student Balance (calculated from packages minus lesson durations)
  async getStudentBalance(studentId: string): Promise<{ totalPurchased: number; totalUsed: number; remaining: number }> {
    const [purchasedRow] = await db
      .select({ total: sql<number>`coalesce(sum(${studentPackages.minutesPurchased}), 0)` })
      .from(studentPackages)
      .where(eq(studentPackages.studentId, studentId));

    const totalPurchased = Number(purchasedRow?.total ?? 0);

    // Sum durations of completed lessons linked to this student
    const [usedRow] = await db
      .select({
        total: sql<number>`coalesce(sum(extract(epoch from (${classEvents.endDateTime} - ${classEvents.startDateTime})) / 60), 0)`
      })
      .from(classEvents)
      .where(
        and(
          eq(classEvents.studentId, studentId),
          eq(classEvents.isAvailabilityBlock, false),
          lte(classEvents.endDateTime, new Date()),
        )
      );

    const totalUsed = Math.round(Number(usedRow?.total ?? 0));
    return { totalPurchased, totalUsed, remaining: totalPurchased - totalUsed };
  }

  async getAllStudentsWithBalances(): Promise<Array<Student & { teacherName: string; totalPurchased: number; totalUsed: number; remaining: number; lastLessonDate: string | null }>> {
    const allStudents = await this.getAllStudents();
    const results = await Promise.all(
      allStudents.map(async (student) => {
        const balance = await this.getStudentBalance(student.id);
        const [lastLesson] = await db
          .select({ endDateTime: classEvents.endDateTime })
          .from(classEvents)
          .where(and(eq(classEvents.studentId, student.id), eq(classEvents.isAvailabilityBlock, false), lte(classEvents.endDateTime, new Date())))
          .orderBy(desc(classEvents.endDateTime))
          .limit(1);
        return {
          ...student,
          ...balance,
          lastLessonDate: lastLesson ? lastLesson.endDateTime.toISOString() : null,
        };
      })
    );
    return results;
  }

  // Student Balance Contacts
  async getBalanceContactsByStudent(studentId: string): Promise<StudentBalanceContact[]> {
    return db.select().from(studentBalanceContacts).where(eq(studentBalanceContacts.studentId, studentId)).orderBy(desc(studentBalanceContacts.contactedAt));
  }

  async createBalanceContact(contact: InsertStudentBalanceContact): Promise<StudentBalanceContact> {
    const [created] = await db.insert(studentBalanceContacts).values(contact).returning();
    return created;
  }

  // Master Schedule
  async getAllMasterSchedules(): Promise<Array<MasterSchedule & { studentName: string; teacherName: string }>> {
    const rows = await db
      .select({ ...masterSchedule, studentName: students.name, teacherName: teachers.name })
      .from(masterSchedule)
      .innerJoin(students, eq(masterSchedule.studentId, students.id))
      .innerJoin(teachers, eq(masterSchedule.teacherId, teachers.id))
      .orderBy(asc(masterSchedule.dayOfWeek), asc(masterSchedule.startTime));
    return rows as Array<MasterSchedule & { studentName: string; teacherName: string }>;
  }

  async getMasterSchedulesByStudent(studentId: string): Promise<MasterSchedule[]> {
    return db.select().from(masterSchedule).where(eq(masterSchedule.studentId, studentId));
  }

  async createMasterSchedule(schedule: InsertMasterSchedule): Promise<MasterSchedule> {
    const [created] = await db.insert(masterSchedule).values(schedule).returning();
    return created;
  }

  async updateMasterSchedule(id: string, updates: Partial<InsertMasterSchedule>): Promise<MasterSchedule | undefined> {
    const [updated] = await db.update(masterSchedule).set({ ...updates, updatedAt: new Date() }).where(eq(masterSchedule.id, id)).returning();
    return updated;
  }

  async deleteMasterSchedule(id: string): Promise<boolean> {
    const result = await db.delete(masterSchedule).where(eq(masterSchedule.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
