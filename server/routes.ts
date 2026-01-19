import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { getGoogleCalendarClient } from "./integrations/googleCalendar";
import { getGoogleSheetsClient } from "./integrations/googleSheets";
import { insertLeaveRequestSchema, updateLeaveRequestSchema, insertTeacherSchema } from "@shared/schema";
import type { CalendarEvent, AttendanceRow } from "@shared/schema";

// Role-based access control middleware
const requireTeacher: RequestHandler = async (req, res, next) => {
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
  
  if (!teacher) {
    return res.status(403).json({ message: "Access denied - not registered as teacher. Please contact your administrator." });
  }

  if (!teacher.isActive) {
    return res.status(403).json({ message: "Account deactivated" });
  }

  (req as any).teacher = teacher;
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

  // Get current teacher's profile
  app.get("/api/teachers/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // First try to find by userId
      let teacher = await storage.getTeacherByUserId(userId);
      
      // If not found, try by email (for first-time users)
      if (!teacher) {
        const email = req.user?.claims?.email;
        if (email) {
          teacher = await storage.getTeacherByEmail(email);
          if (teacher) {
            // Link the user ID to the teacher record
            teacher = await storage.updateTeacher(teacher.id, { userId });
          }
        }
      }

      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      res.json(teacher);
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

  // Get attendance data from Google Sheets
  app.get("/api/attendance", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.sheetId || !teacher.sheetRowStart) {
        return res.json([]);
      }

      const sheets = await getGoogleSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: teacher.sheetId,
        range: teacher.sheetRowStart,
      });

      const rows = response.data.values || [];
      const attendance: AttendanceRow[] = rows.map((row: any[], index: number) => ({
        rowIndex: index + 2, // +2 because sheets are 1-indexed and we skip header
        date: row[0] || "",
        studentName: row[1] || "",
        classTime: row[2] || "",
        attendance: row[3] || "",
        notes: row[4] || "",
        lessonPlan: row[5] || "", // Protected column
        homework: row[6] || "", // Protected column
      }));

      res.json(attendance);
    } catch (error) {
      console.error("Error fetching attendance:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  // Helper function to parse row range (e.g., "A2:F100" -> { startRow: 2, endRow: 100 })
  const parseRowRange = (range: string): { startRow: number; endRow: number } | null => {
    const match = range.match(/[A-Z]+(\d+):[A-Z]+(\d+)/i);
    if (!match) return null;
    return { startRow: parseInt(match[1], 10), endRow: parseInt(match[2], 10) };
  };

  // Update attendance (only allowed columns and within assigned row range)
  app.patch("/api/attendance/:rowIndex", isAuthenticated, requireTeacher, async (req: any, res) => {
    try {
      const teacher = req.teacher;
      if (!teacher.sheetId || !teacher.sheetRowStart) {
        return res.status(400).json({ message: "No sheet assigned" });
      }

      const rowIndex = parseInt(req.params.rowIndex, 10);
      if (isNaN(rowIndex)) {
        return res.status(400).json({ message: "Invalid row index" });
      }
      const { field, value } = req.body;

      // Validate row index is within assigned range
      const rowBounds = parseRowRange(teacher.sheetRowStart);
      if (!rowBounds) {
        return res.status(400).json({ message: "Invalid sheet range configuration" });
      }

      if (rowIndex < rowBounds.startRow || rowIndex > rowBounds.endRow) {
        return res.status(403).json({ message: "Row not within your assigned attendance range" });
      }

      // Only allow updating specific columns (attendance = D, notes = E)
      const allowedFields: Record<string, string> = {
        attendance: "D",
        notes: "E",
      };

      const column = allowedFields[field];
      if (!column) {
        return res.status(400).json({ message: "Field not editable" });
      }

      const sheets = await getGoogleSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: teacher.sheetId,
        range: `${column}${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[value]],
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating attendance:", error);
      res.status(500).json({ message: "Failed to update attendance" });
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
      const teacher = await storage.updateTeacher(id, req.body);
      
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

  return httpServer;
}
