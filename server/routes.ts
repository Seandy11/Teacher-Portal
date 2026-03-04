import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { getGoogleCalendarClient } from "./integrations/googleCalendar";
import { getGoogleSheetsClient } from "./integrations/googleSheets";
import { insertLeaveRequestSchema, updateLeaveRequestSchema, insertTeacherSchema, insertBonusSchema } from "@shared/schema";
import type { CalendarEvent, AttendanceRow } from "@shared/schema";

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

  // ============ ATTENDANCE ROUTES ============

  // Get sheet tabs (worksheets) for the teacher's spreadsheet
  app.get("/api/attendance/tabs", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.sheetId) {
        return res.json([]);
      }

      const sheets = await getGoogleSheetsClient();
      const response = await sheets.spreadsheets.get({
        spreadsheetId: teacher.sheetId,
        fields: "sheets.properties",
      });

      const tabs = (response.data.sheets || []).map((sheet: any) => ({
        name: sheet.properties.title,
        sheetId: sheet.properties.sheetId,
      }));

      res.json(tabs);
    } catch (error) {
      console.error("Error fetching sheet tabs:", error);
      res.status(500).json({ message: "Failed to fetch sheet tabs" });
    }
  });

  // Get attendance data from Google Sheets for a specific tab
  // Data starts at row 4 (rows 1-3 are headers)
  // Structure: A=No., B=Date, C=Lesson details (editable), D=Teacher, E=Lesson time purchased, F=Lesson duration, G=Remaining time, H=Notes
  app.get("/api/attendance", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.sheetId) {
        return res.json([]);
      }

      const tabName = req.query.tab as string;
      if (!tabName) {
        return res.json([]);
      }

      const sheets = await getGoogleSheetsClient();
      
      // Get cell values (data starts at row 3)
      const range = `'${tabName}'!A3:I1000`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: teacher.sheetId,
        range: range,
      });

      const rows = response.data.values || [];
      
      // Get data validation for column C to find dropdown options
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
              dropdownOptionsMap.set(index + 3, options); // +3 because data starts at row 3
            }
          }
        });
      } catch (validationError) {
        console.error("Error fetching data validation:", validationError);
        // Continue without dropdown options
      }

      const attendance: AttendanceRow[] = rows.map((row: any[], index: number) => {
        const rowNum = index + 3; // +3 because data starts at row 3
        return {
          rowIndex: rowNum,
          lessonNo: row[0] || "",
          date: row[1] || "",
          lessonDetails: row[2] || "",
          teacher: row[3] || "",
          lessonTimePurchased: row[4] || "",
          lessonDuration: row[5] || "",
          remainingTime: row[6] || "",
          referralCredits: row[7] || "",
          notes: row[8] || "",
          dropdownOptions: dropdownOptionsMap.get(rowNum),
        };
      }).filter((row: AttendanceRow) => row.date || row.lessonNo); // Filter out empty rows

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  // Update lesson details (Column C only)
  app.patch("/api/attendance/:rowIndex", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.sheetId) {
        return res.status(400).json({ message: "No sheet assigned" });
      }

      const rowIndex = parseInt(req.params.rowIndex, 10);
      if (isNaN(rowIndex) || rowIndex < 3) {
        return res.status(400).json({ message: "Invalid row index" });
      }

      const { tabName, value } = req.body;
      if (!tabName) {
        return res.status(400).json({ message: "Tab name is required" });
      }

      const sheets = await getGoogleSheetsClient();
      
      // Update Column C (lesson details) only
      await sheets.spreadsheets.values.update({
        spreadsheetId: teacher.sheetId,
        range: `'${tabName}'!C${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[value]],
        },
      });

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
      const activeTeachers = allTeachers.filter(t => t.isActive);
      
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
