import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { getGoogleCalendarClient } from "./integrations/googleCalendar";
import { getGoogleSheetsClient } from "./integrations/googleSheets";
import { insertLeaveRequestSchema, updateLeaveRequestSchema, insertTeacherSchema, insertBonusSchema, students, lessonRecords } from "@shared/schema";
import type { CalendarEvent, AttendanceRow, Student, LessonRecord } from "@shared/schema";

const MASTER_ADMIN_EMAIL = "admin@brighthorizononline.com";

const requireTeacher: RequestHandler = async (req: any, res, next) => {
  const userId = req.user?.id;
  const userEmail = req.user?.email;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let actualTeacher = await storage.getTeacherByUserId(userId);
  
  if (!actualTeacher && userEmail) {
    actualTeacher = await storage.getTeacherByEmail(userEmail);
    if (actualTeacher && !actualTeacher.userId) {
      actualTeacher = await storage.updateTeacher(actualTeacher.id, { userId });
    }
  }
  
  if (!actualTeacher) {
    return res.status(403).json({ message: "Access denied - not registered as teacher. Please contact your administrator." });
  }

  if (!actualTeacher.isActive) {
    return res.status(403).json({ message: "Account deactivated" });
  }

  const impersonateTeacherId = req.session?.impersonateTeacherId;
  if (impersonateTeacherId && actualTeacher.role === "admin") {
    const impersonatedTeacher = await storage.getTeacher(impersonateTeacherId);
    if (impersonatedTeacher) {
      req.teacher = impersonatedTeacher;
      req.isImpersonating = true;
      req.actualAdmin = actualTeacher;
      return next();
    }
  }

  req.teacher = actualTeacher;
  next();
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.id;
  const userEmail = (req.user as any)?.email;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let teacher = await storage.getTeacherByUserId(userId);
  
  if (!teacher && userEmail) {
    teacher = await storage.getTeacherByEmail(userEmail);
    if (teacher && !teacher.userId) {
      teacher = await storage.updateTeacher(teacher.id, { userId });
    }
  }
  
  if (!teacher || teacher.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  if (!teacher.isActive) {
    return res.status(403).json({ message: "Account deactivated" });
  }

  (req as any).teacher = teacher;
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup auth (must be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  // ============ TEACHER ROUTES ============

  app.get("/api/teachers/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let actualTeacher = await storage.getTeacherByUserId(userId);
      
      if (!actualTeacher) {
        const email = req.user?.email;
        if (email) {
          actualTeacher = await storage.getTeacherByEmail(email);
          if (actualTeacher) {
            actualTeacher = await storage.updateTeacher(actualTeacher.id, { userId });
          }
        }
      }

      if (!actualTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      const impersonateTeacherId = req.session?.impersonateTeacherId;
      if (impersonateTeacherId && actualTeacher.role === "admin") {
        const impersonatedTeacher = await storage.getTeacher(impersonateTeacherId);
        if (impersonatedTeacher) {
          return res.json(impersonatedTeacher);
        }
      }

      res.json(actualTeacher);
    } catch (error) {
      console.error("Error fetching teacher:", error);
      res.status(500).json({ message: "Failed to fetch teacher" });
    }
  });

  // ============ CALENDAR ROUTES ============

  // Get calendar events (classes + availability blocks)
  app.get("/api/calendar/events", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.calendarId) {
        return res.json([]);
      }

      const calendar = await getGoogleCalendarClient();
      const now = new Date();
      const timeMin = req.query.timeMin
        ? new Date(req.query.timeMin as string)
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const timeMax = req.query.timeMax
        ? new Date(req.query.timeMax as string)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Fetch colors from Google Calendar API
      const [eventsResponse, colorsResponse, calendarListEntry] = await Promise.all([
        calendar.events.list({
          calendarId: teacher.calendarId,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        }),
        calendar.colors.get(),
        calendar.calendarList.get({ calendarId: teacher.calendarId }),
      ]);

      // Build color map from API response
      const eventColors = colorsResponse.data.event || {};
      const calendarDefaultColor = calendarListEntry.data.backgroundColor || "#039be5";

      const events: CalendarEvent[] = (eventsResponse.data.items || []).map((event: any) => {
        // Priority: eventColors[colorId] > calendar default
        let bgColor = calendarDefaultColor;
        if (event.colorId && eventColors[event.colorId]?.background) {
          bgColor = eventColors[event.colorId].background!;
        }
        
        return {
          id: event.id,
          title: event.summary || "Untitled",
          description: event.description || "",
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          isAvailabilityBlock: event.summary?.toLowerCase().includes("blocked") || 
                               event.summary?.toLowerCase().includes("unavailable") ||
                               event.extendedProperties?.private?.type === "availability_block",
          colorId: event.colorId,
          backgroundColor: bgColor,
        };
      });

      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events" });
    }
  });

  // Create availability block
  app.post("/api/calendar/availability", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.calendarId) {
        return res.status(400).json({ message: "No calendar assigned" });
      }

      const { start, end } = req.body;
      if (!start || !end) {
        return res.status(400).json({ message: "Start and end times required" });
      }

      const calendar = await getGoogleCalendarClient();
      const response = await calendar.events.insert({
        calendarId: teacher.calendarId,
        requestBody: {
          summary: "Blocked - Unavailable",
          description: "Availability blocked via Teacher Portal",
          start: { dateTime: start },
          end: { dateTime: end },
          extendedProperties: {
            private: { type: "availability_block" },
          },
        },
      });

      res.json({
        id: response.data.id,
        title: response.data.summary,
        start: response.data.start?.dateTime,
        end: response.data.end?.dateTime,
        isAvailabilityBlock: true,
      });
    } catch (error) {
      console.error("Error creating availability block:", error);
      res.status(500).json({ message: "Failed to create availability block" });
    }
  });

  // Delete availability block (only availability blocks, not class events)
  app.delete("/api/calendar/availability/:eventId", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.calendarId) {
        return res.status(400).json({ message: "No calendar assigned" });
      }

      const { eventId } = req.params;
      const calendar = await getGoogleCalendarClient();
      
      // First, fetch the event to verify it's an availability block
      const eventResponse = await calendar.events.get({
        calendarId: teacher.calendarId,
        eventId: eventId,
      });

      const event = eventResponse.data;
      const isAvailabilityBlock = 
        event.summary?.toLowerCase().includes("blocked") || 
        event.summary?.toLowerCase().includes("unavailable") ||
        event.extendedProperties?.private?.type === "availability_block";

      if (!isAvailabilityBlock) {
        return res.status(403).json({ message: "Cannot delete class events - only availability blocks can be removed" });
      }
      
      await calendar.events.delete({
        calendarId: teacher.calendarId,
        eventId: eventId,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting availability block:", error);
      res.status(500).json({ message: "Failed to delete availability block" });
    }
  });

  // ============ ATTENDANCE ROUTES (Database-backed) ============

  // Get student tabs for the teacher (reads from DB)
  app.get("/api/attendance/tabs", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const studentList = await storage.getStudentsByTeacher(teacher.id);
      const tabs = studentList.map(s => ({
        name: s.name,
        sheetId: 0,
        studentId: s.id,
        courseName: s.courseName,
      }));
      res.json(tabs);
    } catch (error) {
      console.error("Error fetching student tabs:", error);
      res.status(500).json({ message: "Failed to fetch student tabs" });
    }
  });

  // Get attendance data from database for a specific student
  app.get("/api/attendance", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const studentId = req.query.studentId as string;
      const tabName = req.query.tab as string;

      if (!studentId && !tabName) {
        return res.json([]);
      }

      let targetStudentId = studentId;
      if (!targetStudentId && tabName) {
        const studentList = await storage.getStudentsByTeacher(teacher.id);
        const found = studentList.find(s => s.name === tabName);
        if (!found) return res.json([]);
        targetStudentId = found.id;
      }

      const records = await storage.getLessonRecordsByStudent(targetStudentId);
      const attendance: AttendanceRow[] = records.map(r => ({
        rowIndex: r.sheetRowIndex || 0,
        recordId: r.id,
        lessonNo: r.lessonNo || "",
        date: r.date || "",
        lessonDetails: r.lessonDetails || "",
        teacher: r.teacher || "",
        lessonTimePurchased: r.lessonTimePurchased || "",
        lessonDuration: r.lessonDuration || "",
        remainingTime: r.remainingTime || "",
        referralCredits: r.referralCredits || "",
        notes: r.notes || "",
        dropdownOptions: r.dropdownOptions || undefined,
      }));

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  // Update lesson details — saves to DB and syncs to Google Sheets as backup
  app.patch("/api/attendance/:recordId", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const recordId = req.params.recordId;
      const { value, tabName } = req.body;

      const record = await storage.getLessonRecord(recordId);
      if (!record) {
        return res.status(404).json({ message: "Record not found" });
      }
      if (record.teacherId !== teacher.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.updateLessonRecord(recordId, { lessonDetails: value });

      // Sync to Google Sheets as backup (fire-and-forget)
      if (teacher.sheetId && record.sheetRowIndex && tabName) {
        try {
          const sheets = await getGoogleSheetsClient();
          await sheets.spreadsheets.values.update({
            spreadsheetId: teacher.sheetId,
            range: `'${tabName}'!C${record.sheetRowIndex}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[value]] },
          });
        } catch (sheetError) {
          console.error("Sheet sync failed (non-critical):", sheetError);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating lesson details:", error);
      res.status(500).json({ message: "Failed to update lesson details" });
    }
  });

  // ============ LEAVE REQUEST ROUTES ============

  // Get current teacher's leave requests
  app.get("/api/leave-requests/me", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const requests = await storage.getLeaveRequestsByTeacher(teacher.id);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      res.status(500).json({ message: "Failed to fetch leave requests" });
    }
  });

  // Create leave request
  app.post("/api/leave-requests", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const validatedData = insertLeaveRequestSchema.parse({
        ...req.body,
        teacherId: teacher.id,
      });

      const request = await storage.createLeaveRequest(validatedData);
      res.status(201).json(request);
    } catch (error: any) {
      console.error("Error creating leave request:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create leave request" });
    }
  });

  // ============ ADMIN ROUTES ============

  // List available Google Calendars (admin only)
  app.get("/api/admin/calendars", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const calendar = await getGoogleCalendarClient();
      const response = await calendar.calendarList.list();
      
      const calendars = (response.data.items || []).map((cal: any) => ({
        id: cal.id,
        name: cal.summary || cal.id,
        description: cal.description || "",
        primary: cal.primary || false,
        backgroundColor: cal.backgroundColor,
      }));

      res.json(calendars);
    } catch (error) {
      console.error("Error fetching calendar list:", error);
      res.status(500).json({ message: "Failed to fetch calendars" });
    }
  });

  // Get all teachers (admin only)
  app.get("/api/admin/teachers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      res.json(teachers);
    } catch (error) {
      console.error("Error fetching teachers:", error);
      res.status(500).json({ message: "Failed to fetch teachers" });
    }
  });

  app.post("/api/admin/teachers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const existing = await storage.getTeacherByEmail(req.body.email);
      if (existing) {
        return res.status(400).json({ message: "Teacher with this email already exists" });
      }

      const user = await authStorage.upsertUser({
        email: req.body.email.toLowerCase(),
        firstName: req.body.name?.split(" ")[0] || "",
        lastName: req.body.name?.split(" ").slice(1).join(" ") || "",
      });

      const validatedData = insertTeacherSchema.parse({
        ...req.body,
        userId: user.id,
      });

      const teacher = await storage.createTeacher(validatedData);
      res.status(201).json(teacher);
    } catch (error: any) {
      console.error("Error creating teacher:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create teacher" });
    }
  });

  // Update teacher (admin only)
  app.patch("/api/admin/teachers/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const existingTeacher = await storage.getTeacher(id);
      if (!existingTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (existingTeacher.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
        if (req.body.isActive === false) {
          return res.status(403).json({ message: "Cannot deactivate the master admin account." });
        }
        if (req.body.role && req.body.role !== "admin") {
          return res.status(403).json({ message: "Cannot change the master admin's role." });
        }
      }

      const sanitizedBody = { ...req.body };
      const optionalFields = ['hourlyRate', 'sheetId', 'sheetRowStart', 'calendarId'];
      for (const field of optionalFields) {
        if (sanitizedBody[field] === '' || sanitizedBody[field] === 'none') {
          sanitizedBody[field] = null;
        }
      }
      
      const teacher = await storage.updateTeacher(id, sanitizedBody);

      res.json(teacher);
    } catch (error) {
      console.error("Error updating teacher:", error);
      res.status(500).json({ message: "Failed to update teacher" });
    }
  });

  // Delete teacher (admin only - must be inactive)
  app.delete("/api/admin/teachers/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      
      const teacher = await storage.getTeacher(id);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (teacher.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
        return res.status(403).json({ message: "Cannot delete the master admin account." });
      }
      
      if (teacher.isActive) {
        return res.status(400).json({ message: "Cannot delete an active teacher. Deactivate first." });
      }
      
      const deleted = await storage.deleteTeacher(id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete teacher" });
      }
      
      res.json({ success: true, message: "Teacher deleted successfully" });
    } catch (error) {
      console.error("Error deleting teacher:", error);
      res.status(500).json({ message: "Failed to delete teacher" });
    }
  });

  app.post("/api/admin/teachers/:id/reset-password", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const teacher = await storage.getTeacher(id);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (teacher.userId) {
        await authStorage.clearPassword(teacher.userId);
        await authStorage.destroyUserSessions(teacher.userId);
      }

      res.json({ success: true, message: `Password reset for ${teacher.name}. They can now set a new password.` });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/admin/leave-requests", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const requests = await storage.getAllLeaveRequests();
      
      // Join with teacher data
      const teachers = await storage.getAllTeachers();
      const teacherMap = new Map(teachers.map(t => [t.id, t]));
      
      const enrichedRequests = requests.map(r => ({
        ...r,
        teacher: teacherMap.get(r.teacherId),
      }));

      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      res.status(500).json({ message: "Failed to fetch leave requests" });
    }
  });

  // Get all teachers' calendar events (admin overview)
  app.get("/api/admin/calendar/all", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      const activeTeachersWithCalendars = teachers.filter(t => t.isActive && t.calendarId);
      
      if (activeTeachersWithCalendars.length === 0) {
        return res.json([]);
      }

      const calendar = await getGoogleCalendarClient();
      
      // Accept week start/end parameters for fetching specific weeks
      const timeMinParam = req.query.timeMin as string;
      const timeMaxParam = req.query.timeMax as string;
      
      const timeMin = timeMinParam ? new Date(timeMinParam) : new Date();
      const timeMax = timeMaxParam ? new Date(timeMaxParam) : new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);

      const allEvents: Array<CalendarEvent & { teacherId: string; teacherName: string; teacherColor: string }> = [];

      // Generate deterministic colors based on teacher ID hash
      const colors = [
        "#3b82f6", // blue
        "#10b981", // emerald
        "#f59e0b", // amber
        "#ef4444", // red
        "#8b5cf6", // violet
        "#ec4899", // pink
        "#06b6d4", // cyan
        "#84cc16", // lime
      ];

      // Simple hash function to get consistent color from teacher ID
      const getColorForTeacher = (teacherId: string): string => {
        let hash = 0;
        for (let i = 0; i < teacherId.length; i++) {
          const char = teacherId.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return colors[Math.abs(hash) % colors.length];
      };

      // Fetch colors from Google Calendar API once
      const colorsResponse = await calendar.colors.get();
      const eventColors = colorsResponse.data.event || {};

      for (const teacher of activeTeachersWithCalendars) {
        try {
          const [eventsResponse, calendarListEntry] = await Promise.all([
            calendar.events.list({
              calendarId: teacher.calendarId!,
              timeMin: timeMin.toISOString(),
              timeMax: timeMax.toISOString(),
              singleEvents: true,
              orderBy: "startTime",
            }),
            calendar.calendarList.get({ calendarId: teacher.calendarId! }),
          ]);

          const teacherColor = getColorForTeacher(teacher.id);
          const calendarDefaultColor = calendarListEntry.data.backgroundColor || teacherColor;
          
          const events = (eventsResponse.data.items || []).map((event: any) => {
            // Priority: eventColors[colorId] > calendar default
            let bgColor = calendarDefaultColor;
            if (event.colorId && eventColors[event.colorId]?.background) {
              bgColor = eventColors[event.colorId].background!;
            }
            
            return {
              id: event.id,
              title: event.summary || "Untitled",
              description: event.description || "",
              start: event.start?.dateTime || event.start?.date,
              end: event.end?.dateTime || event.end?.date,
              isAvailabilityBlock: event.summary?.toLowerCase().includes("blocked") || 
                                   event.summary?.toLowerCase().includes("unavailable") ||
                                   event.extendedProperties?.private?.type === "availability_block",
              colorId: event.colorId,
              backgroundColor: bgColor,
              teacherId: teacher.id,
              teacherName: teacher.name,
              teacherColor: teacherColor,
            };
          });

          allEvents.push(...events);
        } catch (calendarError) {
          console.error(`Error fetching calendar for teacher ${teacher.id}:`, calendarError);
          // Continue with other teachers even if one fails
        }
      }

      // Sort by start time
      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      res.json(allEvents);
    } catch (error) {
      console.error("Error fetching all calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar overview" });
    }
  });

  // Update leave request status (admin only)
  app.patch("/api/admin/leave-requests/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const validatedData = updateLeaveRequestSchema.parse(req.body);
      
      const request = await storage.updateLeaveRequest(id, validatedData);
      
      if (!request) {
        return res.status(404).json({ message: "Leave request not found" });
      }

      res.json(request);
    } catch (error: any) {
      console.error("Error updating leave request:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update leave request" });
    }
  });

  // ============ BONUS ROUTES ============

  // Get bonuses for a teacher by month (admin only)
  app.get("/api/admin/bonuses/:teacherId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const teacherId = req.params.teacherId as string;
      const month = req.query.month as string | undefined;
      
      if (month) {
        const bonuses = await storage.getBonusesByTeacherAndMonth(teacherId, month);
        return res.json(bonuses);
      }
      
      const bonuses = await storage.getBonusesByTeacher(teacherId);
      res.json(bonuses);
    } catch (error) {
      console.error("Error fetching bonuses:", error);
      res.status(500).json({ message: "Failed to fetch bonuses" });
    }
  });

  // Create a bonus (admin only)
  app.post("/api/admin/bonuses", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.teacher?.id;
      const validatedData = insertBonusSchema.parse({
        ...req.body,
        createdBy: adminId,
      });
      
      const bonus = await storage.createBonus(validatedData);
      res.status(201).json(bonus);
    } catch (error: any) {
      console.error("Error creating bonus:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create bonus" });
    }
  });

  // Delete a bonus (admin only)
  app.delete("/api/admin/bonuses/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const id = req.params.id as string;
      const deleted = await storage.deleteBonus(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Bonus not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bonus:", error);
      res.status(500).json({ message: "Failed to delete bonus" });
    }
  });

  // ============ ADMIN STUDENT & ATTENDANCE MANAGEMENT ============

  // List students for a teacher
  app.get("/api/admin/students/:teacherId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const studentList = await storage.getStudentsByTeacher(req.params.teacherId);
      res.json(studentList);
    } catch (error) {
      console.error("Error fetching students:", error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });

  // Add a student to a teacher
  app.post("/api/admin/students/:teacherId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { name, courseName } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Student name is required" });
      }
      const student = await storage.createStudent({
        teacherId: req.params.teacherId,
        name,
        courseName: courseName || name,
      });
      res.json(student);
    } catch (error) {
      console.error("Error creating student:", error);
      res.status(500).json({ message: "Failed to create student" });
    }
  });

  // Update student (name or course title)
  app.patch("/api/admin/students/:studentId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { name, courseName } = req.body;
      const updated = await storage.updateStudent(req.params.studentId, { name, courseName });
      if (!updated) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating student:", error);
      res.status(500).json({ message: "Failed to update student" });
    }
  });

  // Delete student (and all their lesson records)
  app.delete("/api/admin/students/:studentId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteStudent(req.params.studentId);
      if (!deleted) {
        return res.status(404).json({ message: "Student not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting student:", error);
      res.status(500).json({ message: "Failed to delete student" });
    }
  });

  // Get lesson records for a student (admin)
  app.get("/api/admin/attendance/:studentId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const records = await storage.getLessonRecordsByStudent(req.params.studentId);
      res.json(records);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  // Update any field on a lesson record (admin)
  app.patch("/api/admin/attendance/:recordId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const record = await storage.getLessonRecord(req.params.recordId);
      if (!record) {
        return res.status(404).json({ message: "Record not found" });
      }

      const allowedFields = ["lessonNo", "date", "lessonDetails", "teacher", "lessonTimePurchased", "lessonDuration", "remainingTime", "referralCredits", "notes", "dropdownOptions"];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const updated = await storage.updateLessonRecord(req.params.recordId, updates);

      // Sync to sheet as backup if possible
      const student = await storage.getStudent(record.studentId);
      const teacher = await storage.getTeacher(record.teacherId);
      if (teacher?.sheetId && record.sheetRowIndex && student?.sheetTab) {
        try {
          const sheets = await getGoogleSheetsClient();
          const rowValues = [
            updated?.lessonNo || "",
            updated?.date || "",
            updated?.lessonDetails || "",
            updated?.teacher || "",
            updated?.lessonTimePurchased || "",
            updated?.lessonDuration || "",
            updated?.remainingTime || "",
            updated?.referralCredits || "",
            updated?.notes || "",
          ];
          await sheets.spreadsheets.values.update({
            spreadsheetId: teacher.sheetId,
            range: `'${student.sheetTab}'!A${record.sheetRowIndex}:I${record.sheetRowIndex}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [rowValues] },
          });
        } catch (sheetError) {
          console.error("Sheet sync failed (non-critical):", sheetError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating attendance record:", error);
      res.status(500).json({ message: "Failed to update record" });
    }
  });

  // Add a new lesson record (admin)
  app.post("/api/admin/attendance/:studentId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const student = await storage.getStudent(req.params.studentId);
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      const record = await storage.createLessonRecord({
        teacherId: student.teacherId,
        studentId: student.id,
        lessonNo: req.body.lessonNo || "",
        date: req.body.date || "",
        lessonDetails: req.body.lessonDetails || "",
        teacher: req.body.teacher || "",
        lessonTimePurchased: req.body.lessonTimePurchased || "",
        lessonDuration: req.body.lessonDuration || "",
        remainingTime: req.body.remainingTime || "",
        referralCredits: req.body.referralCredits || "",
        notes: req.body.notes || "",
        dropdownOptions: req.body.dropdownOptions || null,
      });
      res.json(record);
    } catch (error) {
      console.error("Error creating lesson record:", error);
      res.status(500).json({ message: "Failed to create record" });
    }
  });

  // Delete a lesson record (admin)
  app.delete("/api/admin/attendance/:recordId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteLessonRecord(req.params.recordId);
      if (!deleted) {
        return res.status(404).json({ message: "Record not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting record:", error);
      res.status(500).json({ message: "Failed to delete record" });
    }
  });

  // Import attendance data from Google Sheets for a specific teacher
  app.post("/api/admin/import-attendance/:teacherId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const teacher = await storage.getTeacher(req.params.teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      if (!teacher.sheetId) {
        return res.status(400).json({ message: "Teacher has no sheet assigned" });
      }

      const sheets = await getGoogleSheetsClient();
      const sheetMeta = await sheets.spreadsheets.get({
        spreadsheetId: teacher.sheetId,
        fields: "sheets.properties",
      });

      const tabs = (sheetMeta.data.sheets || []).map((s: any) => s.properties.title);
      let totalImported = 0;

      for (const tabName of tabs) {
        // Check if student already exists for this teacher+tab
        const existingStudents = await storage.getStudentsByTeacher(teacher.id);
        let student = existingStudents.find(s => s.sheetTab === tabName || s.name === tabName);

        if (!student) {
          student = await storage.createStudent({
            teacherId: teacher.id,
            name: tabName,
            courseName: tabName,
            sheetTab: tabName,
          });
        }

        // Check if records already exist for this student
        const existingRecords = await storage.getLessonRecordsByStudent(student.id);
        if (existingRecords.length > 0) {
          continue; // Skip if already imported
        }

        // Fetch data from sheet
        const range = `'${tabName}'!A3:I1000`;
        let response;
        try {
          response = await sheets.spreadsheets.values.get({
            spreadsheetId: teacher.sheetId,
            range,
          });
        } catch (e) {
          console.error(`Error fetching tab ${tabName}:`, e);
          continue;
        }

        const rows = response.data.values || [];

        // Get dropdown options for column C
        let dropdownOptionsMap: Map<number, string[]> = new Map();
        try {
          const validationResponse = await sheets.spreadsheets.get({
            spreadsheetId: teacher.sheetId,
            ranges: [`'${tabName}'!C3:C1000`],
            fields: "sheets.data.rowData.values.dataValidation",
          });
          const rowData = validationResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];
          rowData.forEach((row: any, index: number) => {
            const validation = row?.values?.[0]?.dataValidation;
            if (validation?.condition?.type === "ONE_OF_LIST" && validation?.condition?.values) {
              const options = validation.condition.values.map((v: any) => v.userEnteredValue || "").filter((v: string) => v);
              if (options.length > 0) {
                dropdownOptionsMap.set(index + 3, options);
              }
            }
          });
        } catch (e) {
          // Continue without dropdown options
        }

        const records = rows
          .map((row: any[], index: number) => {
            const rowNum = index + 3;
            if (!row[0] && !row[1]) return null; // Skip empty rows
            return {
              teacherId: teacher.id,
              studentId: student!.id,
              lessonNo: row[0] || "",
              date: row[1] || "",
              lessonDetails: row[2] || "",
              teacher: row[3] || "",
              lessonTimePurchased: row[4] || "",
              lessonDuration: row[5] || "",
              remainingTime: row[6] || "",
              referralCredits: row[7] || "",
              notes: row[8] || "",
              dropdownOptions: dropdownOptionsMap.get(rowNum) || null,
              sheetRowIndex: rowNum,
            };
          })
          .filter(Boolean) as any[];

        if (records.length > 0) {
          await storage.bulkCreateLessonRecords(records);
          totalImported += records.length;
        }
      }

      res.json({ success: true, tabsProcessed: tabs.length, recordsImported: totalImported });
    } catch (error) {
      console.error("Error importing attendance:", error);
      res.status(500).json({ message: "Failed to import attendance data" });
    }
  });

  // Import attendance for all teachers at once
  app.post("/api/admin/import-attendance-all", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const allTeachers = await storage.getAllTeachers();
      const teachersWithSheets = allTeachers.filter(t => t.sheetId && t.role === "teacher");
      const results: any[] = [];

      for (const teacher of teachersWithSheets) {
        try {
          const sheets = await getGoogleSheetsClient();
          const sheetMeta = await sheets.spreadsheets.get({
            spreadsheetId: teacher.sheetId!,
            fields: "sheets.properties",
          });

          const tabs = (sheetMeta.data.sheets || []).map((s: any) => s.properties.title);
          let teacherImported = 0;

          for (const tabName of tabs) {
            const existingStudents = await storage.getStudentsByTeacher(teacher.id);
            let student = existingStudents.find(s => s.sheetTab === tabName || s.name === tabName);

            if (!student) {
              student = await storage.createStudent({
                teacherId: teacher.id,
                name: tabName,
                courseName: tabName,
                sheetTab: tabName,
              });
            }

            const existingRecords = await storage.getLessonRecordsByStudent(student.id);
            if (existingRecords.length > 0) continue;

            let response;
            try {
              response = await sheets.spreadsheets.values.get({
                spreadsheetId: teacher.sheetId!,
                range: `'${tabName}'!A3:I1000`,
              });
            } catch (e) {
              continue;
            }

            const rows = response.data.values || [];

            let dropdownOptionsMap: Map<number, string[]> = new Map();
            try {
              const validationResponse = await sheets.spreadsheets.get({
                spreadsheetId: teacher.sheetId!,
                ranges: [`'${tabName}'!C3:C1000`],
                fields: "sheets.data.rowData.values.dataValidation",
              });
              const rowData = validationResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];
              rowData.forEach((row: any, index: number) => {
                const validation = row?.values?.[0]?.dataValidation;
                if (validation?.condition?.type === "ONE_OF_LIST" && validation?.condition?.values) {
                  const options = validation.condition.values.map((v: any) => v.userEnteredValue || "").filter((v: string) => v);
                  if (options.length > 0) {
                    dropdownOptionsMap.set(index + 3, options);
                  }
                }
              });
            } catch (e) {}

            const records = rows
              .map((row: any[], index: number) => {
                const rowNum = index + 3;
                if (!row[0] && !row[1]) return null;
                return {
                  teacherId: teacher.id,
                  studentId: student!.id,
                  lessonNo: row[0] || "",
                  date: row[1] || "",
                  lessonDetails: row[2] || "",
                  teacher: row[3] || "",
                  lessonTimePurchased: row[4] || "",
                  lessonDuration: row[5] || "",
                  remainingTime: row[6] || "",
                  referralCredits: row[7] || "",
                  notes: row[8] || "",
                  dropdownOptions: dropdownOptionsMap.get(rowNum) || null,
                  sheetRowIndex: rowNum,
                };
              })
              .filter(Boolean) as any[];

            if (records.length > 0) {
              await storage.bulkCreateLessonRecords(records);
              teacherImported += records.length;
            }
          }

          results.push({ teacher: teacher.name, tabs: tabs.length, records: teacherImported });
        } catch (e) {
          console.error(`Error importing for ${teacher.name}:`, e);
          results.push({ teacher: teacher.name, error: "Import failed" });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error importing all attendance:", error);
      res.status(500).json({ message: "Failed to import attendance data" });
    }
  });

  // ============ PAY CALCULATION ROUTES ============

  // Helper function to parse currency value (e.g., "R100.00" -> 100.00, "-R50" -> -50)
  const parseCurrencyValue = (value: string | undefined): number => {
    if (!value || typeof value !== "string") return 0;
    // Remove all characters except digits, minus, and decimal point
    const isNegative = value.includes("-") || value.includes("(");
    const cleaned = value.replace(/[^0-9.]/g, "");
    let num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
    return isNegative ? -num : num;
  };

  // Helper function to check if teacher names match
  const teacherNameMatches = (sheetName: string, teacherName: string): boolean => {
    const sheetLower = sheetName.toLowerCase().trim();
    const teacherLower = teacherName.toLowerCase().trim();
    const teacherFirstName = teacherLower.split(" ")[0];
    
    if (sheetLower === teacherFirstName) return true;
    if (sheetLower === teacherLower) return true;
    
    return false;
  };

  // Helper function to fetch bonuses from payroll sheet
  const fetchBonusesFromSheet = async (teacherName: string, year: number, monthNum: number) => {
    const payrollSheetId = process.env.PAYROLL_SHEET_ID;
    if (!payrollSheetId) {
      console.log("No PAYROLL_SHEET_ID configured, returning zero bonuses");
      return { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, total: 0, matchedRows: [] as { sheetName: string; year: number; month: number; assessment: number; training: number; referral: number; retention: number; demo: number; notes: string }[] };
    }

    try {
      const sheets = await getGoogleSheetsClient();
      const range = "'Adjustments'!A2:I5000";
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: payrollSheetId,
        range: range,
      });

      const rows = response.data.values || [];
      let assessment = 0, training = 0, referral = 0, retention = 0, demo = 0;
      const matchedRows: { sheetName: string; year: number; month: number; assessment: number; training: number; referral: number; retention: number; demo: number; notes: string }[] = [];
      
      for (const row of rows) {
        const rowTeacher = (row[0] || "").toString();
        const rowYear = parseInt(row[1] || "0", 10);
        const rowMonth = parseInt(row[2] || "0", 10);
        
        if (teacherNameMatches(rowTeacher, teacherName) && rowYear === year && rowMonth === monthNum) {
          const rowAssessment = parseCurrencyValue(row[3]);
          const rowTraining = parseCurrencyValue(row[4]);
          const rowReferral = parseCurrencyValue(row[5]);
          const rowRetention = parseCurrencyValue(row[6]);
          const rowDemo = parseCurrencyValue(row[7]);
          
          assessment += rowAssessment;
          training += rowTraining;
          referral += rowReferral;
          retention += rowRetention;
          demo += rowDemo;
          
          matchedRows.push({
            sheetName: rowTeacher,
            year: rowYear,
            month: rowMonth,
            assessment: rowAssessment,
            training: rowTraining,
            referral: rowReferral,
            retention: rowRetention,
            demo: rowDemo,
            notes: (row[8] || "").toString(),
          });
        }
      }

      const total = assessment + training + referral + retention + demo;
      console.log(`Bonuses for ${teacherName} (${year}-${monthNum}): ${matchedRows.length} rows matched`, 
        { assessment, training, referral, retention, demo, total });
      
      return { assessment, training, referral, retention, demo, total, matchedRows };
    } catch (error) {
      console.error("Error fetching bonuses from payroll sheet:", error);
      return { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, total: 0, matchedRows: [] as { sheetName: string; year: number; month: number; assessment: number; training: number; referral: number; retention: number; demo: number; notes: string }[] };
    }
  };

  // Get pay summary for a teacher (teacher can view own, admin can view any)
  app.get("/api/pay/summary", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const month = (req.query.month as string) || defaultMonth;
      const [year, monthNum] = month.split("-").map(Number);
      
      const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
      
      let totalMinutes = 0;
      const countedEvents: { title: string; duration: number; date: string; time: string }[] = [];
      const skippedEvents: { title: string; reason: string }[] = [];
      
      if (teacher.calendarId) {
        try {
          const calendar = await getGoogleCalendarClient();
          const timeMin = new Date(year, monthNum - 1, 1);
          const timeMax = new Date(year, monthNum, 0, 23, 59, 59);
          
          const response = await calendar.events.list({
            calendarId: teacher.calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
          });
          
          for (const event of response.data.items || []) {
            const title = event.summary || "";
            const titleLower = title.toLowerCase();
            
            const isAvailabilityBlock = titleLower.includes("blocked") || 
                                       titleLower.includes("unavailable") ||
                                       event.extendedProperties?.private?.type === "availability_block";
            const isDemo = titleLower.includes("demo");
            const isLeave = titleLower.includes("leave");
            
            if (!event.start?.dateTime || !event.end?.dateTime) {
              skippedEvents.push({ title, reason: "all-day event" });
              continue;
            }
            
            if (isAvailabilityBlock) {
              skippedEvents.push({ title, reason: "availability block" });
              continue;
            }
            
            if (isDemo) {
              skippedEvents.push({ title, reason: "DEMO class" });
              continue;
            }
            
            if (isLeave) {
              skippedEvents.push({ title, reason: "LEAVE" });
              continue;
            }
            
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            
            if (end.getTime() <= now.getTime()) {
              const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
              totalMinutes += durationMinutes;
              countedEvents.push({ 
                title, 
                duration: durationMinutes, 
                date: start.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
                time: `${start.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}`,
              });
            } else {
              skippedEvents.push({ title, reason: "not ended yet" });
            }
          }
          
          console.log(`Pay calculation for ${teacher.name} (${month}):`, {
            totalMinutes,
            eventsCounted: countedEvents.length,
            eventsSkipped: skippedEvents.length
          });
        } catch (calendarError) {
          console.error("Error fetching calendar for pay calculation:", calendarError);
        }
      }
      
      const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
      const hoursWorked = totalMinutes / 60;
      const basePay = hoursWorked * hourlyRate;
      const totalPay = basePay + bonuses.total;
      
      const isCurrentMonth = month === defaultMonth;
      
      res.json({
        month,
        teacherId: teacher.id,
        teacherName: teacher.name,
        hourlyRate,
        totalMinutes,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        basePay: parseFloat(basePay.toFixed(2)),
        bonuses: {
          assessment: parseFloat(bonuses.assessment.toFixed(2)),
          training: parseFloat(bonuses.training.toFixed(2)),
          referral: parseFloat(bonuses.referral.toFixed(2)),
          retention: parseFloat(bonuses.retention.toFixed(2)),
          demo: parseFloat(bonuses.demo.toFixed(2)),
          total: parseFloat(bonuses.total.toFixed(2)),
        },
        totalPay: parseFloat(totalPay.toFixed(2)),
        isCurrentMonth,
        eventBreakdown: {
          counted: countedEvents,
          skipped: skippedEvents,
        },
        bonusRows: bonuses.matchedRows,
      });
    } catch (error) {
      console.error("Error calculating pay summary:", error);
      res.status(500).json({ message: "Failed to calculate pay summary" });
    }
  });

  // Get pay summary for a specific teacher (admin only)
  app.get("/api/admin/pay/:teacherId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const teacherId = req.params.teacherId;
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const month = (req.query.month as string) || defaultMonth;
      const [year, monthNum] = month.split("-").map(Number);
      
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      
      const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
      
      let totalMinutes = 0;
      const countedEvents: { title: string; duration: number; date: string; time: string }[] = [];
      const skippedEvents: { title: string; reason: string }[] = [];
      
      if (teacher.calendarId) {
        try {
          const calendar = await getGoogleCalendarClient();
          const timeMin = new Date(year, monthNum - 1, 1);
          const timeMax = new Date(year, monthNum, 0, 23, 59, 59);
          
          const response = await calendar.events.list({
            calendarId: teacher.calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
          });
          
          for (const event of response.data.items || []) {
            const title = event.summary || "";
            const titleLower = title.toLowerCase();
            
            const isAvailabilityBlock = titleLower.includes("blocked") || 
                                       titleLower.includes("unavailable") ||
                                       event.extendedProperties?.private?.type === "availability_block";
            const isDemo = titleLower.includes("demo");
            const isLeave = titleLower.includes("leave");
            
            if (!event.start?.dateTime || !event.end?.dateTime) {
              skippedEvents.push({ title, reason: "all-day event" });
              continue;
            }
            
            if (isAvailabilityBlock || isDemo || isLeave) {
              skippedEvents.push({ title, reason: isAvailabilityBlock ? "availability block" : isDemo ? "DEMO class" : "LEAVE" });
              continue;
            }
            
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            
            if (end.getTime() <= now.getTime()) {
              const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
              totalMinutes += durationMinutes;
              countedEvents.push({ 
                title, 
                duration: durationMinutes, 
                date: start.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
                time: `${start.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}`,
              });
            } else {
              skippedEvents.push({ title, reason: "not ended yet" });
            }
          }
        } catch (calendarError) {
          console.error("Error fetching calendar for pay calculation:", calendarError);
        }
      }
      
      const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
      const hoursWorked = totalMinutes / 60;
      const basePay = hoursWorked * hourlyRate;
      const totalPay = basePay + bonuses.total;
      
      const isCurrentMonth = month === defaultMonth;
      
      res.json({
        month,
        teacherId: teacher.id,
        teacherName: teacher.name,
        hourlyRate,
        totalMinutes,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        basePay: parseFloat(basePay.toFixed(2)),
        bonuses: {
          assessment: parseFloat(bonuses.assessment.toFixed(2)),
          training: parseFloat(bonuses.training.toFixed(2)),
          referral: parseFloat(bonuses.referral.toFixed(2)),
          retention: parseFloat(bonuses.retention.toFixed(2)),
          demo: parseFloat(bonuses.demo.toFixed(2)),
          total: parseFloat(bonuses.total.toFixed(2)),
        },
        totalPay: parseFloat(totalPay.toFixed(2)),
        isCurrentMonth,
        eventBreakdown: {
          counted: countedEvents,
          skipped: skippedEvents,
        },
        bonusRows: bonuses.matchedRows,
      });
    } catch (error) {
      console.error("Error calculating pay summary:", error);
      res.status(500).json({ message: "Failed to calculate pay summary" });
    }
  });

  // Get payroll summary for all active teachers (admin only)
  app.get("/api/admin/payroll", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const month = (req.query.month as string) || defaultMonth;
      const [year, monthNum] = month.split("-").map(Number);
      const isCurrentMonth = month === defaultMonth;
      
      const allTeachers = await storage.getAllTeachers();
      const activeTeachers = allTeachers.filter(t => t.isActive && t.email.toLowerCase() !== MASTER_ADMIN_EMAIL);
      
      const calendar = await getGoogleCalendarClient();
      const timeMin = new Date(year, monthNum - 1, 1);
      const timeMax = new Date(year, monthNum, 0, 23, 59, 59);
      
      const results = await Promise.all(activeTeachers.map(async (teacher) => {
        try {
          const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
          
          let totalMinutes = 0;
          const countedEvents: { title: string; duration: number; date: string; time: string }[] = [];
          const skippedEvents: { title: string; reason: string }[] = [];
          
          if (teacher.calendarId) {
            try {
              const response = await calendar.events.list({
                calendarId: teacher.calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: "startTime",
              });
              
              for (const event of response.data.items || []) {
                const title = event.summary || "";
                const titleLower = title.toLowerCase();
                
                const isAvailabilityBlock = titleLower.includes("blocked") || 
                                           titleLower.includes("unavailable") ||
                                           event.extendedProperties?.private?.type === "availability_block";
                const isDemo = titleLower.includes("demo");
                const isLeave = titleLower.includes("leave");
                
                if (!event.start?.dateTime || !event.end?.dateTime) {
                  skippedEvents.push({ title, reason: "all-day event" });
                  continue;
                }
                
                if (isAvailabilityBlock || isDemo || isLeave) {
                  skippedEvents.push({ title, reason: isAvailabilityBlock ? "availability block" : isDemo ? "DEMO class" : "LEAVE" });
                  continue;
                }
                
                const start = new Date(event.start.dateTime);
                const end = new Date(event.end.dateTime);
                
                if (end.getTime() <= now.getTime()) {
                  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
                  totalMinutes += durationMinutes;
                  countedEvents.push({ 
                    title, 
                    duration: durationMinutes, 
                    date: start.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
                    time: `${start.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' })}`,
                  });
                } else {
                  skippedEvents.push({ title, reason: "not ended yet" });
                }
              }
            } catch (calendarError) {
              console.error(`Error fetching calendar for ${teacher.name}:`, calendarError);
            }
          }
          
          const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
          const hoursWorked = totalMinutes / 60;
          const basePay = hoursWorked * hourlyRate;
          const totalPay = basePay + bonuses.total;
          
          return {
            month,
            teacherId: teacher.id,
            teacherName: teacher.name,
            hourlyRate,
            totalMinutes,
            hoursWorked: parseFloat(hoursWorked.toFixed(2)),
            basePay: parseFloat(basePay.toFixed(2)),
            bonuses: {
              assessment: parseFloat(bonuses.assessment.toFixed(2)),
              training: parseFloat(bonuses.training.toFixed(2)),
              referral: parseFloat(bonuses.referral.toFixed(2)),
              retention: parseFloat(bonuses.retention.toFixed(2)),
              demo: parseFloat(bonuses.demo.toFixed(2)),
              total: parseFloat(bonuses.total.toFixed(2)),
            },
            totalPay: parseFloat(totalPay.toFixed(2)),
            isCurrentMonth,
            eventBreakdown: {
              counted: countedEvents,
              skipped: skippedEvents,
            },
            bonusRows: bonuses.matchedRows,
          };
        } catch (teacherError) {
          console.error(`Error calculating pay for ${teacher.name}:`, teacherError);
          return {
            month,
            teacherId: teacher.id,
            teacherName: teacher.name,
            hourlyRate: teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0,
            totalMinutes: 0,
            hoursWorked: 0,
            basePay: 0,
            bonuses: { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, total: 0 },
            totalPay: 0,
            isCurrentMonth,
            eventBreakdown: { counted: [], skipped: [] },
            bonusRows: [],
            error: "Failed to calculate",
          };
        }
      }));
      
      res.json(results);
    } catch (error) {
      console.error("Error fetching payroll:", error);
      res.status(500).json({ message: "Failed to fetch payroll data" });
    }
  });

  // ============ IMPERSONATION ROUTES ============
  // NOTE: Specific routes (/exit, /status) MUST be defined before parameterized routes (/:teacherId)

  // Stop impersonating (admin only) - MUST be before /:teacherId route
  app.post("/api/admin/impersonate/exit", isAuthenticated, async (req: any, res) => {
    try {
      const wasImpersonating = req.session.impersonateTeacherId;
      delete req.session.impersonateTeacherId;
      delete req.session.realAdminId;
      
      if (wasImpersonating) {
        console.log(`Stopped impersonating teacher ${wasImpersonating}`);
      }
      
      res.json({ success: true, message: "Stopped impersonation" });
    } catch (error) {
      console.error("Error stopping impersonation:", error);
      res.status(500).json({ message: "Failed to stop impersonation" });
    }
  });

  // Start impersonating a teacher (admin only)
  app.post("/api/admin/impersonate/:teacherId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const teacherId = req.params.teacherId as string;
      const adminId = req.teacher?.id;
      
      const targetTeacher = await storage.getTeacher(teacherId);
      if (!targetTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      
      // Store impersonation in session
      req.session.impersonateTeacherId = teacherId;
      req.session.realAdminId = adminId;
      
      console.log(`Admin ${adminId} started impersonating teacher ${teacherId}`);
      
      res.json({ 
        success: true, 
        impersonating: targetTeacher,
        message: `Now viewing as ${targetTeacher.name}`
      });
    } catch (error) {
      console.error("Error starting impersonation:", error);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  app.get("/api/admin/impersonate/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;
      
      if (!userId) {
        return res.json({ isImpersonating: false });
      }

      let actualTeacher = await storage.getTeacherByUserId(userId);
      if (!actualTeacher && userEmail) {
        actualTeacher = await storage.getTeacherByEmail(userEmail);
      }
      
      if (!actualTeacher || actualTeacher.role !== "admin") {
        return res.json({ isImpersonating: false });
      }

      const impersonateTeacherId = req.session.impersonateTeacherId;
      
      if (!impersonateTeacherId) {
        return res.json({ isImpersonating: false });
      }
      
      const teacher = await storage.getTeacher(impersonateTeacherId);
      
      res.json({
        isImpersonating: true,
        teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
      });
    } catch (error) {
      console.error("Error getting impersonation status:", error);
      res.status(500).json({ message: "Failed to get impersonation status" });
    }
  });

  return httpServer;
}
