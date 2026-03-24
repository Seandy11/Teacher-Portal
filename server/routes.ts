import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import crypto from "crypto";
import { getGoogleCalendarClient, getAuthUrl, exchangeCodeForTokens, isGoogleConnected } from "./integrations/googleCalendar";
import { getGoogleSheetsClient } from "./integrations/googleSheets";
import { insertLeaveRequestSchema, updateLeaveRequestSchema, insertTeacherSchema, insertBonusSchema } from "@shared/schema";
import type { CalendarEvent, AttendanceRow } from "@shared/schema";

const MASTER_ADMIN_EMAIL = "admin@brighthorizononline.com";

// Google Calendar color palette (colorId → hex)
const GC_COLOR_HEX: Record<string, string> = {
  "1": "#D50000", "2": "#E67C73", "3": "#F4511E", "4": "#F6BF26",
  "5": "#33B679", "6": "#0B8043", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#7986CB", "11": "#8E24AA",
};

// Deterministic teacher color from ID hash
function getTeacherColor(teacherId: string): string {
  const palette = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
  let hash = 0;
  for (let i = 0; i < teacherId.length; i++) {
    hash = ((hash << 5) - hash) + teacherId.charCodeAt(i);
    hash = hash & hash;
  }
  return palette[Math.abs(hash) % palette.length];
}

// Sync one teacher's Google Calendar events into the class_events DB table
async function syncTeacherEventsFromGoogle(
  teacherId: string, calendarId: string,
  timeMin: Date, timeMax: Date,
): Promise<void> {
  const calendar = await getGoogleCalendarClient();
  const [colorsResponse, calListEntry] = await Promise.all([
    calendar.colors.get(),
    calendar.calendarList.get({ calendarId }).catch(() => ({ data: { backgroundColor: "#039be5" } })),
  ]);
  const eventColors = colorsResponse.data.event || {};
  const calendarDefaultColor = (calListEntry as any).data?.backgroundColor || "#039be5";

  let pageToken: string | undefined = undefined;
  let totalFetched = 0;
  let pageNum = 0;
  do {
    pageNum++;
    const eventsResponse = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
    });
    const items = eventsResponse.data.items || [];
    totalFetched += items.length;
    pageToken = eventsResponse.data.nextPageToken ?? undefined;
    console.log(`[sync] teacherId=${teacherId} page=${pageNum} items=${items.length} total=${totalFetched} hasMore=${!!pageToken}`);

    for (const event of items) {
      if (!event.id) continue;
      const start = event.start?.dateTime || event.start?.date;
      const end = event.end?.dateTime || event.end?.date;
      if (!start || !end) continue;

      let bgColor = calendarDefaultColor;
      if (event.colorId && eventColors[event.colorId]?.background) {
        bgColor = eventColors[event.colorId].background!;
      }
      const isAvailabilityBlock = !!(
        event.summary?.toLowerCase().includes("blocked") ||
        event.summary?.toLowerCase().includes("unavailable") ||
        event.extendedProperties?.private?.type === "availability_block"
      );
      await storage.upsertClassEventByGoogleId(event.id, {
        teacherId,
        calendarId,
        title: event.summary || "Untitled",
        description: event.description || null,
        startDateTime: new Date(start),
        endDateTime: new Date(end),
        colorId: event.colorId || null,
        backgroundColor: bgColor,
        isAvailabilityBlock,
        isRecurring: !!(event.recurrence || event.recurringEventId),
        recurrenceRule: event.recurrence?.[0] || null,
      });
    }
  } while (pageToken);
}

// Calculate pay from DB class_events (replaces Google Calendar reads in pay routes)
async function calculatePayFromDB(teacherId: string, year: number, monthNum: number) {
  const timeMin = new Date(year, monthNum - 1, 1);
  const timeMax = new Date(year, monthNum, 0, 23, 59, 59);
  const now = new Date();
  const events = await storage.getClassEventsByTeacherAndRange(teacherId, timeMin, timeMax);
  let totalMinutes = 0;
  const countedEvents: { title: string; duration: number; date: string; time: string }[] = [];
  const skippedEvents: { title: string; reason: string }[] = [];
  for (const event of events) {
    const title = event.title;
    const titleLower = title.toLowerCase();
    if (event.colorId === "8") { skippedEvents.push({ title, reason: "grey event" }); continue; }
    if (event.isAvailabilityBlock) { skippedEvents.push({ title, reason: "availability block" }); continue; }
    if (titleLower.includes("demo")) { skippedEvents.push({ title, reason: "DEMO class" }); continue; }
    if (titleLower.includes("leave")) { skippedEvents.push({ title, reason: "LEAVE" }); continue; }
    const start = event.startDateTime;
    const end = event.endDateTime;
    if (end.getTime() <= now.getTime()) {
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      totalMinutes += durationMinutes;
      countedEvents.push({
        title, duration: durationMinutes,
        date: start.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" }),
        time: `${start.toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })}`,
      });
    } else {
      skippedEvents.push({ title, reason: "not ended yet" });
    }
  }
  return { totalMinutes, countedEvents, skippedEvents };
}

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

  // ============ GOOGLE OAUTH ROUTES ============

  app.get("/api/auth/google", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const state = crypto.randomBytes(32).toString("hex");
      req.session.googleOAuthState = state;
      const url = getAuthUrl(state);
      res.redirect(url);
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ message: "Failed to initiate Google auth" });
    }
  });

  app.get("/api/auth/google/callback", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      const expectedState = req.session.googleOAuthState;

      if (!code || !state || state !== expectedState) {
        return res.redirect("/?google=error");
      }

      delete req.session.googleOAuthState;
      await exchangeCodeForTokens(code);
      res.redirect("/?google=connected");
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("/?google=error");
    }
  });

  app.get("/api/auth/google/status", isAuthenticated, async (req: any, res) => {
    try {
      const connected = await isGoogleConnected();
      res.json({ connected });
    } catch (error) {
      res.json({ connected: false });
    }
  });

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
      const now = new Date();
      const timeMin = req.query.timeMin
        ? new Date(req.query.timeMin as string)
        : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const timeMax = req.query.timeMax
        ? new Date(req.query.timeMax as string)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const dbEvents = await storage.getClassEventsByTeacherAndRange(teacher.id, timeMin, timeMax);
      const events: CalendarEvent[] = dbEvents.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description || "",
        start: e.startDateTime.toISOString(),
        end: e.endDateTime.toISOString(),
        isAvailabilityBlock: e.isAvailabilityBlock ?? false,
        colorId: e.colorId ?? undefined,
        backgroundColor: e.backgroundColor ?? undefined,
        googleEventId: e.googleEventId,
        calendarId: e.calendarId,
      }));

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
      const { start, end } = req.body;
      if (!start || !end) return res.status(400).json({ message: "Start and end times required" });

      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";
      let googleEventId: string | null = null;

      // Write to Google Calendar if sync is on and teacher has a calendar
      if (syncEnabled && teacher.calendarId && await isGoogleConnected()) {
        try {
          const calendar = await getGoogleCalendarClient();
          const response = await calendar.events.insert({
            calendarId: teacher.calendarId,
            requestBody: {
              summary: "Blocked - Unavailable",
              description: "Availability blocked via Teacher Portal",
              start: { dateTime: start },
              end: { dateTime: end },
              extendedProperties: { private: { type: "availability_block" } },
            },
          });
          googleEventId = response.data.id || null;
        } catch (gErr) {
          console.error("Google Calendar write failed for availability block:", gErr);
        }
      }

      // Always write to DB
      const dbEvent = await storage.createClassEvent({
        teacherId: teacher.id,
        calendarId: teacher.calendarId || null,
        googleEventId,
        title: "Blocked - Unavailable",
        description: "Availability blocked via Teacher Portal",
        startDateTime: new Date(start),
        endDateTime: new Date(end),
        colorId: null, backgroundColor: null,
        isAvailabilityBlock: true, isRecurring: false, recurrenceRule: null,
      });

      res.json({
        id: dbEvent.id,
        title: dbEvent.title,
        start: dbEvent.startDateTime.toISOString(),
        end: dbEvent.endDateTime.toISOString(),
        isAvailabilityBlock: true,
      });
    } catch (error) {
      console.error("Error creating availability block:", error);
      res.status(500).json({ message: "Failed to create availability block" });
    }
  });

  // Delete availability block
  app.delete("/api/calendar/availability/:eventId", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const { eventId } = req.params;

      // Look up the DB event (eventId can be DB UUID or Google event ID)
      // Try DB UUID first, then fall back to googleEventId lookup
      let dbEvent = (await storage.getClassEventsByTeacherAndRange(teacher.id, new Date(0), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)))
        .find(e => e.id === eventId || e.googleEventId === eventId);

      if (!dbEvent || !dbEvent.isAvailabilityBlock) {
        return res.status(403).json({ message: "Cannot delete: not an availability block or not found" });
      }

      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";
      if (syncEnabled && dbEvent.calendarId && dbEvent.googleEventId && await isGoogleConnected()) {
        try {
          const calendar = await getGoogleCalendarClient();
          await calendar.events.delete({ calendarId: dbEvent.calendarId, eventId: dbEvent.googleEventId });
        } catch (gErr) {
          console.error("Google Calendar delete failed:", gErr);
        }
      }

      await storage.deleteClassEvent(dbEvent.id);
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

  // Sync Google Calendar events into the portal DB (admin only)
  app.post("/api/admin/sync-calendar", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";
      if (!syncEnabled) return res.status(400).json({ message: "Google sync is disabled" });
      if (!await isGoogleConnected()) return res.status(400).json({ message: "Google not connected" });

      const timeMin = req.body.timeMin ? new Date(req.body.timeMin) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const timeMax = req.body.timeMax ? new Date(req.body.timeMax) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const allTeachers = await storage.getAllTeachers();
      const active = allTeachers.filter(t => t.isActive && t.calendarId);

      console.log(`[sync] Starting calendar sync for ${active.length} teachers, range: ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
      let synced = 0;
      const errors: string[] = [];
      for (const teacher of active) {
        try {
          console.log(`[sync] Syncing ${teacher.name} (${teacher.id}) calendar=${teacher.calendarId}`);
          await syncTeacherEventsFromGoogle(teacher.id, teacher.calendarId!, timeMin, timeMax);
          synced++;
          console.log(`[sync] Completed ${teacher.name}`);
        } catch (e: any) {
          console.error(`[sync] ERROR for ${teacher.name}:`, e?.message);
          errors.push(`${teacher.name}: ${e?.message}`);
        }
      }
      await storage.setSetting("calendar-last-sync", new Date().toISOString());
      res.json({ success: true, teachersSynced: synced, errors });
    } catch (error) {
      console.error("Error syncing calendar:", error);
      res.status(500).json({ message: "Sync failed" });
    }
  });

  // Get all teachers' calendar events (admin overview) — reads from DB
  app.get("/api/admin/calendar/all", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const timeMinParam = req.query.timeMin as string;
      const timeMaxParam = req.query.timeMax as string;
      const timeMin = timeMinParam ? new Date(timeMinParam) : new Date();
      const timeMax = timeMaxParam ? new Date(timeMaxParam) : new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);

      const dbEvents = await storage.getAllClassEventsInRange(timeMin, timeMax);

      const allEvents = dbEvents.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description || "",
        start: e.startDateTime.toISOString(),
        end: e.endDateTime.toISOString(),
        isAvailabilityBlock: e.isAvailabilityBlock ?? false,
        isRecurring: e.isRecurring ?? false,
        recurrenceGroupId: e.recurrenceGroupId ?? null,
        colorId: e.colorId ?? undefined,
        backgroundColor: e.backgroundColor ?? undefined,
        googleEventId: e.googleEventId,
        calendarId: e.calendarId,
        teacherId: e.teacherId,
        teacherName: e.teacherName,
        teacherColor: getTeacherColor(e.teacherId),
      }));

      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      res.json(allEvents);
    } catch (error) {
      console.error("Error fetching all calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar overview" });
    }
  });

  // Create a class event — writes to DB first, then syncs to Google if enabled
  app.post("/api/admin/calendar/events", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { teacherId, title, startDateTime, durationMinutes, colorId, recurrence, days } = req.body;
      if (!teacherId || !title || !startDateTime || !durationMinutes) {
        return res.status(400).json({ message: "teacherId, title, startDateTime, durationMinutes required" });
      }
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) return res.status(404).json({ message: "Teacher not found" });

      const start = new Date(startDateTime);
      const durationMs = Number(durationMinutes) * 60 * 1000;
      const bgColor = colorId ? (GC_COLOR_HEX[String(colorId)] ?? null) : null;
      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";

      if (recurrence === "weekly") {
        // Multi-day recurring: create individual DB events for each selected day over 52 weeks
        const selectedDays: number[] = Array.isArray(days) && days.length > 0
          ? days.map(Number)
          : [start.getDay()]; // Default to the day of startDateTime

        const recurrenceGroupId = crypto.randomUUID();
        const WEEKS_AHEAD = 52;

        // Get the Sunday of the week containing start
        const weekSunday = new Date(start);
        weekSunday.setDate(weekSunday.getDate() - weekSunday.getDay());
        weekSunday.setHours(0, 0, 0, 0);

        // Collect all event dates to create
        const eventSlots: { start: Date; end: Date }[] = [];
        const startDateOnly = new Date(start);
        startDateOnly.setHours(0, 0, 0, 0);

        for (let week = 0; week < WEEKS_AHEAD; week++) {
          for (const dayOfWeek of selectedDays) {
            const eventDate = new Date(weekSunday);
            eventDate.setDate(weekSunday.getDate() + week * 7 + dayOfWeek);
            if (eventDate < startDateOnly) continue; // Skip dates before start date
            const eventStart = new Date(eventDate);
            eventStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
            eventSlots.push({ start: eventStart, end: new Date(eventStart.getTime() + durationMs) });
          }
        }

        // Optionally sync first occurrence to Google as a recurring event
        if (syncEnabled && teacher.calendarId && await isGoogleConnected()) {
          try {
            const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
            const byDay = selectedDays.map(d => dayNames[d]).join(',');
            const calendar = await getGoogleCalendarClient();
            const eventBody: any = {
              summary: title,
              start: { dateTime: start.toISOString() },
              end: { dateTime: new Date(start.getTime() + durationMs).toISOString() },
              recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
            };
            if (colorId) eventBody.colorId = String(colorId);
            await calendar.events.insert({ calendarId: teacher.calendarId, requestBody: eventBody });
          } catch (gErr) { console.error("Google recurring write failed:", gErr); }
        }

        // Create all DB events
        await Promise.all(eventSlots.map(slot =>
          storage.createClassEvent({
            teacherId, calendarId: teacher.calendarId || null, googleEventId: null,
            title, description: null,
            startDateTime: slot.start, endDateTime: slot.end,
            colorId: colorId ? String(colorId) : null, backgroundColor: bgColor,
            isAvailabilityBlock: false, isRecurring: true,
            recurrenceGroupId, recurrenceRule: null,
          })
        ));

        return res.json({ success: true, eventsCreated: eventSlots.length, recurrenceGroupId });
      }

      // Once-off event
      let googleEventId: string | null = null;
      if (syncEnabled && teacher.calendarId && await isGoogleConnected()) {
        try {
          const calendar = await getGoogleCalendarClient();
          const eventBody: any = { summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: new Date(start.getTime() + durationMs).toISOString() } };
          if (colorId) eventBody.colorId = String(colorId);
          const gRes = await calendar.events.insert({ calendarId: teacher.calendarId, requestBody: eventBody });
          googleEventId = gRes.data.id || null;
        } catch (gErr) { console.error("Google write failed:", gErr); }
      }

      const dbEvent = await storage.createClassEvent({
        teacherId, calendarId: teacher.calendarId || null, googleEventId,
        title, description: null,
        startDateTime: start, endDateTime: new Date(start.getTime() + durationMs),
        colorId: colorId ? String(colorId) : null, backgroundColor: bgColor,
        isAvailabilityBlock: false, isRecurring: false,
        recurrenceGroupId: null, recurrenceRule: null,
      });

      res.json({ id: dbEvent.id, title: dbEvent.title, start: dbEvent.startDateTime.toISOString(), end: dbEvent.endDateTime.toISOString(), colorId: dbEvent.colorId });
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ message: "Failed to create calendar event" });
    }
  });

  // Update a class event — updates DB, then syncs to Google if enabled
  app.patch("/api/admin/calendar/events/:eventId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { eventId } = req.params;
      const { title, startDateTime, durationMinutes, colorId } = req.body;

      const dbUpdates: Record<string, any> = {};
      if (title !== undefined) dbUpdates.title = title;
      if (colorId !== undefined) {
        dbUpdates.colorId = colorId ? String(colorId) : null;
        dbUpdates.backgroundColor = colorId ? (GC_COLOR_HEX[String(colorId)] ?? null) : null;
      }
      if (startDateTime !== undefined) {
        const start = new Date(startDateTime);
        dbUpdates.startDateTime = start;
        if (durationMinutes !== undefined) {
          dbUpdates.endDateTime = new Date(start.getTime() + Number(durationMinutes) * 60 * 1000);
        }
      }

      const updated = await storage.updateClassEvent(eventId, dbUpdates);
      if (!updated) return res.status(404).json({ message: "Event not found" });

      // Sync to Google if enabled and the event has a googleEventId
      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";
      if (syncEnabled && updated.googleEventId && updated.calendarId && await isGoogleConnected()) {
        try {
          const calendar = await getGoogleCalendarClient();
          const patch: any = {};
          if (title !== undefined) patch.summary = title;
          if (colorId !== undefined) patch.colorId = colorId ? String(colorId) : null;
          if (dbUpdates.startDateTime) patch.start = { dateTime: updated.startDateTime.toISOString() };
          if (dbUpdates.endDateTime) patch.end = { dateTime: updated.endDateTime.toISOString() };
          await calendar.events.patch({ calendarId: updated.calendarId, eventId: updated.googleEventId, requestBody: patch });
        } catch (gErr) { console.error("Google update failed:", gErr); }
      }

      res.json({ id: updated.id, title: updated.title, start: updated.startDateTime.toISOString(), end: updated.endDateTime.toISOString(), colorId: updated.colorId });
    } catch (error) {
      console.error("Error updating calendar event:", error);
      res.status(500).json({ message: "Failed to update calendar event" });
    }
  });

  // Delete a class event — supports deleteType: "single" | "series" | "student"
  app.delete("/api/admin/calendar/events/:eventId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { eventId } = req.params;
      const deleteType: "single" | "series" | "student" = req.body?.deleteType || "single";

      // Look up the base event
      const allEvents = await storage.getAllClassEventsInRange(new Date(0), new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000));
      const dbEvent = allEvents.find(e => e.id === eventId);

      const syncEnabled = (await storage.getSetting("google-calendar-sync")) !== "false";

      const tryDeleteFromGoogle = async (events: { googleEventId?: string | null; calendarId?: string | null }[]) => {
        if (!syncEnabled || !await isGoogleConnected()) return;
        const calendar = await getGoogleCalendarClient();
        for (const e of events) {
          if (e.googleEventId && e.calendarId) {
            try { await calendar.events.delete({ calendarId: e.calendarId, eventId: e.googleEventId }); } catch {}
          }
        }
      };

      if (deleteType === "series" && dbEvent?.recurrenceGroupId) {
        const seriesEvents = await storage.getClassEventsByGroupId(dbEvent.recurrenceGroupId);
        await tryDeleteFromGoogle(seriesEvents);
        const count = await storage.deleteClassEventsByGroupId(dbEvent.recurrenceGroupId);
        return res.json({ success: true, deleted: count });
      }

      if (deleteType === "student" && dbEvent) {
        const studentEvents = await storage.getClassEventsByTitleAndTeacher(dbEvent.teacherId, dbEvent.title);
        await tryDeleteFromGoogle(studentEvents);
        const count = await storage.deleteClassEventsByTitleAndTeacher(dbEvent.teacherId, dbEvent.title);
        return res.json({ success: true, deleted: count });
      }

      // Single delete
      await tryDeleteFromGoogle(dbEvent ? [dbEvent] : []);
      await storage.deleteClassEvent(eventId);
      res.json({ success: true, deleted: 1 });
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ message: "Failed to delete calendar event" });
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

  // ============ SETTINGS ROUTES ============

  // Get a setting value (admin only)
  app.get("/api/admin/settings/:key", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const key = req.params.key as string;
      const value = await storage.getSetting(key);
      res.json({ key, value: value ?? null });
    } catch (error) {
      console.error("Error fetching setting:", error);
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  // Set a setting value (admin only)
  app.put("/api/admin/settings/:key", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const key = req.params.key as string;
      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ message: "Value is required" });
      }
      await storage.setSetting(key, String(value));
      res.json({ key, value: String(value) });
    } catch (error) {
      console.error("Error saving setting:", error);
      res.status(500).json({ message: "Failed to save setting" });
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
      
      const { totalMinutes, countedEvents, skippedEvents } = await calculatePayFromDB(teacher.id, year, monthNum);
      const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
      const hoursWorked = totalMinutes / 60;
      const basePay = hoursWorked * hourlyRate;

      // Merge DB bonuses by category on top of sheet bonuses
      const dbBonuses = await storage.getBonusesByTeacherAndMonth(teacher.id, month);
      const dbByCategory = { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, other: 0 };
      for (const b of dbBonuses) {
        const cat = (b.category || "other") as keyof typeof dbByCategory;
        if (cat in dbByCategory) dbByCategory[cat] += parseFloat(b.amount);
        else dbByCategory.other += parseFloat(b.amount);
      }

      const mergedBonuses = {
        assessment: bonuses.assessment + dbByCategory.assessment,
        training: bonuses.training + dbByCategory.training,
        referral: bonuses.referral + dbByCategory.referral,
        retention: bonuses.retention + dbByCategory.retention,
        demo: bonuses.demo + dbByCategory.demo,
        other: dbByCategory.other,
        total: bonuses.total + dbBonuses.reduce((s, b) => s + parseFloat(b.amount), 0),
      };

      const totalPay = basePay + mergedBonuses.total;
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
          assessment: parseFloat(mergedBonuses.assessment.toFixed(2)),
          training: parseFloat(mergedBonuses.training.toFixed(2)),
          referral: parseFloat(mergedBonuses.referral.toFixed(2)),
          retention: parseFloat(mergedBonuses.retention.toFixed(2)),
          demo: parseFloat(mergedBonuses.demo.toFixed(2)),
          other: parseFloat(mergedBonuses.other.toFixed(2)),
          total: parseFloat(mergedBonuses.total.toFixed(2)),
        },
        totalPay: parseFloat(totalPay.toFixed(2)),
        isCurrentMonth,
        eventBreakdown: {
          counted: countedEvents,
          skipped: skippedEvents,
        },
        bonusRows: bonuses.matchedRows,
        dbBonuses: dbBonuses,
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
      
      const { totalMinutes, countedEvents, skippedEvents } = await calculatePayFromDB(teacher.id, year, monthNum);
      const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
      const hoursWorked = totalMinutes / 60;
      const basePay = hoursWorked * hourlyRate;

      // Merge DB bonuses by category on top of sheet bonuses
      const dbBonuses = await storage.getBonusesByTeacherAndMonth(teacher.id, month);
      const dbByCategory = { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, other: 0 };
      for (const b of dbBonuses) {
        const cat = (b.category || "other") as keyof typeof dbByCategory;
        if (cat in dbByCategory) dbByCategory[cat] += parseFloat(b.amount);
        else dbByCategory.other += parseFloat(b.amount);
      }

      const mergedBonuses = {
        assessment: bonuses.assessment + dbByCategory.assessment,
        training: bonuses.training + dbByCategory.training,
        referral: bonuses.referral + dbByCategory.referral,
        retention: bonuses.retention + dbByCategory.retention,
        demo: bonuses.demo + dbByCategory.demo,
        other: dbByCategory.other,
        total: bonuses.total + dbBonuses.reduce((s, b) => s + parseFloat(b.amount), 0),
      };

      const totalPay = basePay + mergedBonuses.total;
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
          assessment: parseFloat(mergedBonuses.assessment.toFixed(2)),
          training: parseFloat(mergedBonuses.training.toFixed(2)),
          referral: parseFloat(mergedBonuses.referral.toFixed(2)),
          retention: parseFloat(mergedBonuses.retention.toFixed(2)),
          demo: parseFloat(mergedBonuses.demo.toFixed(2)),
          other: parseFloat(mergedBonuses.other.toFixed(2)),
          total: parseFloat(mergedBonuses.total.toFixed(2)),
        },
        totalPay: parseFloat(totalPay.toFixed(2)),
        isCurrentMonth,
        eventBreakdown: {
          counted: countedEvents,
          skipped: skippedEvents,
        },
        bonusRows: bonuses.matchedRows,
        dbBonuses: dbBonuses,
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
      
      const results = await Promise.all(activeTeachers.map(async (teacher) => {
        try {
          const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
          
          const { totalMinutes, countedEvents, skippedEvents } = await calculatePayFromDB(teacher.id, year, monthNum);
          const hourlyRate = teacher.hourlyRate ? parseFloat(teacher.hourlyRate) : 0;
          const hoursWorked = totalMinutes / 60;
          const basePay = hoursWorked * hourlyRate;

          const dbBonusesForTeacher = await storage.getBonusesByTeacherAndMonth(teacher.id, month);
          const dbByCat = { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, other: 0 };
          for (const b of dbBonusesForTeacher) {
            const cat = (b.category || "other") as keyof typeof dbByCat;
            if (cat in dbByCat) dbByCat[cat] += parseFloat(b.amount);
            else dbByCat.other += parseFloat(b.amount);
          }
          const merged = {
            assessment: bonuses.assessment + dbByCat.assessment,
            training: bonuses.training + dbByCat.training,
            referral: bonuses.referral + dbByCat.referral,
            retention: bonuses.retention + dbByCat.retention,
            demo: bonuses.demo + dbByCat.demo,
            other: dbByCat.other,
            total: bonuses.total + dbBonusesForTeacher.reduce((s, b) => s + parseFloat(b.amount), 0),
          };
          const totalPay = basePay + merged.total;
          
          return {
            month,
            teacherId: teacher.id,
            teacherName: teacher.name,
            hourlyRate,
            totalMinutes,
            hoursWorked: parseFloat(hoursWorked.toFixed(2)),
            basePay: parseFloat(basePay.toFixed(2)),
            bonuses: {
              assessment: parseFloat(merged.assessment.toFixed(2)),
              training: parseFloat(merged.training.toFixed(2)),
              referral: parseFloat(merged.referral.toFixed(2)),
              retention: parseFloat(merged.retention.toFixed(2)),
              demo: parseFloat(merged.demo.toFixed(2)),
              other: parseFloat(merged.other.toFixed(2)),
              total: parseFloat(merged.total.toFixed(2)),
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
