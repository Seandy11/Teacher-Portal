import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { getGoogleCalendarClient } from "./integrations/googleCalendar";
import { getGoogleSheetsClient } from "./integrations/googleSheets";
import { insertLeaveRequestSchema, updateLeaveRequestSchema, insertTeacherSchema, insertBonusSchema } from "@shared/schema";
import type { CalendarEvent, AttendanceRow } from "@shared/schema";

// Role-based access control middleware
const requireTeacher: RequestHandler = async (req: any, res, next) => {
  const userId = req.user?.claims?.sub;
  const userEmail = req.user?.claims?.email;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // First get the actual logged-in user's teacher record
  let actualTeacher = await storage.getTeacherByUserId(userId);
  
  // If not found by userId, try by email and link the account
  if (!actualTeacher && userEmail) {
    actualTeacher = await storage.getTeacherByEmail(userEmail);
    if (actualTeacher && !actualTeacher.userId) {
      // Link this user to the existing teacher record
      actualTeacher = await storage.updateTeacher(actualTeacher.id, { userId });
    }
  }
  
  if (!actualTeacher) {
    return res.status(403).json({ message: "Access denied - not registered as teacher. Please contact your administrator." });
  }

  if (!actualTeacher.isActive) {
    return res.status(403).json({ message: "Account deactivated" });
  }

  // Check if admin is impersonating a teacher - only allow if the actual user is an admin
  const impersonateTeacherId = req.session?.impersonateTeacherId;
  if (impersonateTeacherId && actualTeacher.role === "admin") {
    const impersonatedTeacher = await storage.getTeacher(impersonateTeacherId);
    if (impersonatedTeacher) {
      req.teacher = impersonatedTeacher;
      req.isImpersonating = true;
      req.actualAdmin = actualTeacher; // Store the real admin for reference
      return next();
    }
  }

  req.teacher = actualTeacher;
  next();
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = (req.user as any)?.claims?.sub;
  const userEmail = (req.user as any)?.claims?.email;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // First try to find by userId
  let teacher = await storage.getTeacherByUserId(userId);
  
  // If not found by userId, try by email and link the account
  if (!teacher && userEmail) {
    teacher = await storage.getTeacherByEmail(userEmail);
    if (teacher && !teacher.userId) {
      // Link this user to the existing teacher record
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

  // Get current teacher's profile (respects impersonation)
  app.get("/api/teachers/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // First get the actual logged-in user's teacher record
      let actualTeacher = await storage.getTeacherByUserId(userId);
      
      // If not found, try by email (for first-time users)
      if (!actualTeacher) {
        const email = req.user?.claims?.email;
        if (email) {
          actualTeacher = await storage.getTeacherByEmail(email);
          if (actualTeacher) {
            // Link the user ID to the teacher record
            actualTeacher = await storage.updateTeacher(actualTeacher.id, { userId });
          }
        }
      }

      if (!actualTeacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      // If admin is impersonating, return the impersonated teacher's data
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
      const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week ago
      const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

      const response = await calendar.events.list({
        calendarId: teacher.calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events: CalendarEvent[] = (response.data.items || []).map((event: any) => ({
        id: event.id,
        title: event.summary || "Untitled",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        isAvailabilityBlock: event.summary?.toLowerCase().includes("blocked") || 
                             event.summary?.toLowerCase().includes("unavailable") ||
                             event.extendedProperties?.private?.type === "availability_block",
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
      
      // Get cell values (data starts at row 4)
      const range = `'${tabName}'!A4:H1000`;
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
          ranges: [`'${tabName}'!C4:C1000`],
          fields: "sheets.data.rowData.values.dataValidation",
        });
        
        const rowData = validationResponse.data.sheets?.[0]?.data?.[0]?.rowData || [];
        rowData.forEach((row: any, index: number) => {
          const validation = row?.values?.[0]?.dataValidation;
          if (validation?.condition?.type === "ONE_OF_LIST" && validation?.condition?.values) {
            const options = validation.condition.values.map((v: any) => v.userEnteredValue || "").filter((v: string) => v);
            if (options.length > 0) {
              dropdownOptionsMap.set(index + 4, options); // +4 because data starts at row 4
            }
          }
        });
      } catch (validationError) {
        console.error("Error fetching data validation:", validationError);
        // Continue without dropdown options
      }

      const attendance: AttendanceRow[] = rows.map((row: any[], index: number) => {
        const rowNum = index + 4; // +4 because data starts at row 4
        return {
          rowIndex: rowNum,
          lessonNo: row[0] || "",
          date: row[1] || "",
          lessonDetails: row[2] || "",
          teacher: row[3] || "",
          lessonTimePurchased: row[4] || "",
          lessonDuration: row[5] || "",
          remainingTime: row[6] || "",
          notes: row[7] || "",
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
      if (isNaN(rowIndex) || rowIndex < 4) {
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

  // Create teacher (admin only)
  app.post("/api/admin/teachers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertTeacherSchema.parse({
        ...req.body,
        userId: req.body.userId || `pending_${Date.now()}`, // Placeholder until user logs in
      });

      const existing = await storage.getTeacherByEmail(validatedData.email);
      if (existing) {
        return res.status(400).json({ message: "Teacher with this email already exists" });
      }

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
      
      // Sanitize the request body - convert empty strings to null for optional fields
      const sanitizedBody = { ...req.body };
      const optionalFields = ['hourlyRate', 'sheetId', 'sheetRowStart', 'calendarId'];
      for (const field of optionalFields) {
        if (sanitizedBody[field] === '' || sanitizedBody[field] === 'none') {
          sanitizedBody[field] = null;
        }
      }
      
      const teacher = await storage.updateTeacher(id, sanitizedBody);
      
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      res.json(teacher);
    } catch (error) {
      console.error("Error updating teacher:", error);
      res.status(500).json({ message: "Failed to update teacher" });
    }
  });

  // Get all leave requests (admin only)
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

      for (const teacher of activeTeachersWithCalendars) {
        try {
          const response = await calendar.events.list({
            calendarId: teacher.calendarId!,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
          });

          const teacherColor = getColorForTeacher(teacher.id);
          const events = (response.data.items || []).map((event: any) => ({
            id: event.id,
            title: event.summary || "Untitled",
            description: event.description || "",
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            isAvailabilityBlock: event.summary?.toLowerCase().includes("blocked") || 
                                 event.summary?.toLowerCase().includes("unavailable") ||
                                 event.extendedProperties?.private?.type === "availability_block",
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherColor: teacherColor,
          }));

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
    
    // Exact match on first name (common case for this sheet)
    if (sheetLower === teacherFirstName) return true;
    // Full name match
    if (sheetLower === teacherLower) return true;
    // Sheet contains teacher's first name
    if (sheetLower.includes(teacherFirstName)) return true;
    // Teacher name starts with sheet name
    if (teacherLower.startsWith(sheetLower)) return true;
    
    return false;
  };

  // Helper function to fetch bonuses from payroll sheet
  const fetchBonusesFromSheet = async (teacherName: string, year: number, monthNum: number) => {
    const payrollSheetId = process.env.PAYROLL_SHEET_ID;
    if (!payrollSheetId) {
      console.log("No PAYROLL_SHEET_ID configured, returning zero bonuses");
      return { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, total: 0 };
    }

    try {
      const sheets = await getGoogleSheetsClient();
      const range = "'Adjustments'!A2:I5000"; // A=Teacher, B=Year, C=Month, D-H=Bonus types, I=Notes
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: payrollSheetId,
        range: range,
      });

      const rows = response.data.values || [];
      let assessment = 0, training = 0, referral = 0, retention = 0, demo = 0;
      let matchedRows = 0;
      
      for (const row of rows) {
        const rowTeacher = (row[0] || "").toString();
        const rowYear = parseInt(row[1] || "0", 10);
        const rowMonth = parseInt(row[2] || "0", 10);
        
        // Check if this row matches the teacher and month
        if (teacherNameMatches(rowTeacher, teacherName) && rowYear === year && rowMonth === monthNum) {
          matchedRows++;
          assessment += parseCurrencyValue(row[3]);
          training += parseCurrencyValue(row[4]);
          referral += parseCurrencyValue(row[5]);
          retention += parseCurrencyValue(row[6]);
          demo += parseCurrencyValue(row[7]);
        }
      }

      const total = assessment + training + referral + retention + demo;
      console.log(`Bonuses from sheet for ${teacherName} (${year}-${monthNum}): ${matchedRows} matching rows`, 
        { assessment, training, referral, retention, demo, total });
      
      if (matchedRows === 0) {
        console.log(`No bonus rows found for teacher "${teacherName}" in ${year}-${monthNum}. Total sheet rows: ${rows.length}`);
      }
      
      return { assessment, training, referral, retention, demo, total };
    } catch (error) {
      console.error("Error fetching bonuses from payroll sheet:", error);
      return { assessment: 0, training: 0, referral: 0, retention: 0, demo: 0, total: 0 };
    }
  };

  // Get pay summary for a teacher (teacher can view own, admin can view any)
  app.get("/api/pay/summary", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const [year, monthNum] = month.split("-").map(Number);
      
      // Get bonuses from payroll sheet
      const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
      
      // Calculate minutes from calendar if calendar is set up
      // Only count lessons that have ENDED (completed lessons only)
      let totalMinutes = 0;
      const now = new Date();
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
          
          // Sum up duration of all class events
          // Exclude: availability blocks, DEMO classes, LEAVE
          // Only count lessons that have ENDED (end time <= now)
          const countedEvents: { title: string; duration: number; date: string }[] = [];
          const skippedEvents: { title: string; reason: string }[] = [];
          
          for (const event of response.data.items || []) {
            const title = event.summary || "";
            const titleLower = title.toLowerCase();
            
            const isAvailabilityBlock = titleLower.includes("blocked") || 
                                       titleLower.includes("unavailable") ||
                                       event.extendedProperties?.private?.type === "availability_block";
            const isDemo = titleLower.includes("demo");
            const isLeave = titleLower.includes("leave");
            
            // Skip if no dateTime (all-day events like LEAVE)
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
            
            // Only count if the lesson has ended
            if (end.getTime() <= now.getTime()) {
              const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
              totalMinutes += durationMinutes;
              countedEvents.push({ 
                title, 
                duration: durationMinutes, 
                date: start.toISOString().split('T')[0] 
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
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const [year, monthNum] = month.split("-").map(Number);
      
      const teacher = await storage.getTeacher(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }
      
      // Get bonuses from payroll sheet (same as teacher endpoint)
      const bonuses = await fetchBonusesFromSheet(teacher.name, year, monthNum);
      
      // Calculate minutes from calendar if calendar is set up
      // Only count lessons that have ENDED (completed lessons only)
      let totalMinutes = 0;
      const now = new Date();
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
          
          // Sum up duration of all class events
          // Exclude: availability blocks, DEMO classes, LEAVE
          // Only count lessons that have ENDED (end time <= now)
          for (const event of response.data.items || []) {
            const title = event.summary || "";
            const titleLower = title.toLowerCase();
            
            const isAvailabilityBlock = titleLower.includes("blocked") || 
                                       titleLower.includes("unavailable") ||
                                       event.extendedProperties?.private?.type === "availability_block";
            const isDemo = titleLower.includes("demo");
            const isLeave = titleLower.includes("leave");
            
            // Skip if no dateTime (all-day events like LEAVE)
            if (!event.start?.dateTime || !event.end?.dateTime) {
              continue;
            }
            
            if (isAvailabilityBlock || isDemo || isLeave) {
              continue;
            }
            
            const start = new Date(event.start.dateTime);
            const end = new Date(event.end.dateTime);
            
            // Only count if the lesson has ended
            if (end.getTime() <= now.getTime()) {
              const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
              totalMinutes += durationMinutes;
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
      });
    } catch (error) {
      console.error("Error calculating pay summary:", error);
      res.status(500).json({ message: "Failed to calculate pay summary" });
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

  // Get impersonation status (must verify admin before returning impersonation data)
  app.get("/api/admin/impersonate/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const userEmail = req.user?.claims?.email;
      
      if (!userId) {
        return res.json({ isImpersonating: false });
      }

      // First verify the user is an admin
      let actualTeacher = await storage.getTeacherByUserId(userId);
      if (!actualTeacher && userEmail) {
        actualTeacher = await storage.getTeacherByEmail(userEmail);
      }
      
      // Only admins can have impersonation status
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
