# Teacher Portal

A secure, role-based Teacher Portal for ESL schools that replaces and improves upon Google Apps Script workflows.

## Overview

This is an internal teacher portal with the following core features:

### For Teachers:
- **My Timetable**: Read-only view of classes synced from Google Calendar
- **Attendance Tracking**: Fill in specific allowed columns (attendance, notes) that write back to Google Sheets
- **Weekly Availability**: Block/reopen time slots that sync back to Google Calendar
- **Leave Requests**: Submit leave requests visible to admin
- **Pay Dashboard**: View monthly earnings with breakdown of hours worked, base pay, and bonuses

### For Admins:
- **Dashboard**: Overview stats of teachers, pending leave requests
- **Teacher Management**: Add/remove teachers (delete only for inactive), assign calendar & sheet mappings, set hourly rates, toggle active status
- **Leave Management**: View and approve/reject teacher leave requests
- **Calendar Overview**: View all teachers' schedules with filtering, overlapping events side-by-side display
- **View as Teacher**: Impersonate any teacher to see the app from their perspective

### Calendar Display Features:
- **Google Calendar Colors**: Events display using their assigned Google Calendar color (colorId 1-11)
- **Grey Event Exclusion**: Events with colorId 8 (grey) are excluded from timetable display and pay calculations
- **Past Event Fading**: Completed lessons appear faded (opacity 50%)
- **Current Time Indicator**: Animated red dot with time display, updates every minute
- **Hover Tooltips**: Full event details on hover (teacher, date, time, completion status)
- **Click to Focus**: Click an event to bring it to front with details panel
- **Overlapping Events**: Events at the same time shown side-by-side with minimum visible width
- **Defined Borders**: Events have colored borders and subtle shadows for clarity

## Architecture

### Frontend
- **React** with TypeScript
- **Wouter** for routing  
- **TanStack Query** for data fetching
- **Shadcn UI** components with Tailwind CSS
- **Date-fns** for date manipulation

### Backend
- **Express.js** server
- **PostgreSQL** database with Drizzle ORM
- **Email/password authentication** with Passport.js local strategy and bcryptjs
- **Google Calendar API** for timetable and availability
- **Google Sheets API** for attendance tracking

## Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── admin/           # Admin-specific components
│   │   ├── teacher/         # Teacher-specific components
│   │   └── ui/              # Shadcn UI components
│   ├── hooks/               # React hooks (useAuth, useToast)
│   ├── lib/                 # Utilities (queryClient, auth-utils)
│   └── pages/               # Page components

server/
├── integrations/            # Google Calendar & Sheets clients
├── replit_integrations/     # Auth integration
├── db.ts                    # Database connection
├── storage.ts               # Data access layer
└── routes.ts                # API endpoints

shared/
├── models/                  # Auth models
└── schema.ts                # Database schema & types
```

## Database Schema

### Tables
- **users** - Auth user records (email/password auth, password is nullable for first-time setup flow)
- **sessions** - Session storage (PostgreSQL-backed via connect-pg-simple)
- **teachers** - Teacher profiles with calendar/sheet assignments, hourly rates
- **leave_requests** - Leave request records
- **bonuses** - Teacher bonus records (amount, month, description)

### Key Relations
- teachers.userId → users.id
- leave_requests.teacherId → teachers.id
- bonuses.teacherId → teachers.id

## API Endpoints

### Auth
- `POST /api/login` - Email/password login
- `POST /api/register` - First-time password setup (email must be pre-registered by admin)
- `POST /api/logout` - Logout (destroys session)
- `GET /api/logout` - Logout (redirects to home)
- `GET /api/auth/user` - Get current user

### Teacher Endpoints
- `GET /api/teachers/me` - Get current teacher profile
- `GET /api/calendar/events` - Get calendar events
- `POST /api/calendar/availability` - Create availability block
- `DELETE /api/calendar/availability/:eventId` - Remove availability block
- `GET /api/attendance` - Get attendance rows
- `PATCH /api/attendance/:rowIndex` - Update attendance cell
- `GET /api/leave-requests/me` - Get own leave requests
- `POST /api/leave-requests` - Submit leave request

### Admin Endpoints
- `GET /api/admin/teachers` - List all teachers
- `POST /api/admin/teachers` - Add teacher
- `PATCH /api/admin/teachers/:id` - Update teacher (including hourly rate)
- `DELETE /api/admin/teachers/:id` - Delete teacher (inactive only)
- `GET /api/admin/leave-requests` - List all leave requests
- `PATCH /api/admin/leave-requests/:id` - Update leave status
- `GET /api/admin/bonuses` - List bonuses (filtered by teacher/month)
- `POST /api/admin/bonuses` - Add bonus
- `DELETE /api/admin/bonuses/:id` - Delete bonus
- `POST /api/admin/teachers/:id/reset-password` - Reset teacher's password (admin only)
- `POST /api/admin/impersonate/:teacherId` - Start impersonating a teacher
- `POST /api/admin/impersonate/exit` - Stop impersonating
- `GET /api/admin/impersonate/status` - Get current impersonation status
- `GET /api/admin/payroll` - Get pay summaries for all active teachers (accepts ?month=YYYY-MM)

### Pay Endpoints
- `GET /api/pay/summary` - Get pay summary (hours worked, base pay, bonuses, total)

## Role-Based Access

Access is enforced server-side:
- **Teachers**: Can only access their own data, view their calendar, edit their attendance rows
- **Admins**: Full access to manage teachers and leave requests
- **Inactive users**: Cannot access any protected routes

## Google Integrations

### Calendar Integration
- **Read**: Classes are synced one-way from Google Calendar (read-only in app)
- **Write**: Availability blocks can be created/deleted (syncs back to calendar)
- Events with "Blocked" or "Unavailable" in title are treated as availability blocks

### Sheets Integration
- **Read**: Attendance data pulled from assigned sheet range (A3:I1000)
- **Column mapping**: A=No., B=Date, C=Lesson details (editable), D=Teacher, E=Lesson time purchased, F=Lesson duration, G=Remaining time, H=Referral credits, I=Notes & Parent Feedback
- **Write**: Only Column C (lesson details) can be edited by teachers
- **Notes display**: Notes shown as clickable icon with popover; unread notes have red badge (tracked via localStorage)
- Other columns are read-only and protected

### Payroll Sheet Integration (Bonuses)
- **Sheet ID**: Configured via `PAYROLL_SHEET_ID` environment variable
- **Tab**: "Adjustments" tab contains bonus data
- **Columns**: A=Teacher name, B=Year, C=Month, D-H=Bonus types (Assessment, Training, Referral, Retention, Demo), I=Notes
- **Data starts**: Row 2 (header in row 1)
- **Teacher matching**: Uses strict exact matching (first name or full name, case-insensitive)
- **Currency parsing**: Handles R currency format, negatives, and parentheses

## Development

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to database
```

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `PAYROLL_SHEET_ID` - Google Sheet ID for payroll/bonuses data
- Google Calendar connector (configured via Replit integrations)
- Google Sheets connector (configured via Replit integrations)

## Timezone
- School is in South Africa (SAST, UTC+2)
- Server runs in UTC - all month formatting on frontend uses local timezone helpers (`client/src/lib/date-utils.ts`) to avoid off-by-one month issues
- Event dates/times in pay breakdown are formatted in Africa/Johannesburg timezone
- NEVER use `toISOString().slice(0, 7)` for month values - use `formatMonthLocal()` or `getCurrentMonthLocal()` from `@/lib/date-utils`

## Currency
All monetary values are displayed in South African Rand (R), not dollars.
