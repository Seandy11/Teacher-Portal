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
- **Teacher Management**: Add/remove teachers, assign calendar & sheet mappings, set hourly rates, toggle active status
- **Leave Management**: View and approve/reject teacher leave requests
- **Bonus Management**: Add, view, and delete teacher bonuses per month
- **View as Teacher**: Impersonate any teacher to see the app from their perspective

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
- **Replit Auth** (OpenID Connect) for Google login
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
- **users** - Auth user records (from Replit Auth)
- **sessions** - Session storage (from Replit Auth)
- **teachers** - Teacher profiles with calendar/sheet assignments, hourly rates
- **leave_requests** - Leave request records
- **bonuses** - Teacher bonus records (amount, month, description)

### Key Relations
- teachers.userId → users.id
- leave_requests.teacherId → teachers.id
- bonuses.teacherId → teachers.id

## API Endpoints

### Auth
- `GET /api/login` - Initiate login
- `GET /api/logout` - Logout
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
- `GET /api/admin/leave-requests` - List all leave requests
- `PATCH /api/admin/leave-requests/:id` - Update leave status
- `GET /api/admin/bonuses` - List bonuses (filtered by teacher/month)
- `POST /api/admin/bonuses` - Add bonus
- `DELETE /api/admin/bonuses/:id` - Delete bonus
- `POST /api/admin/impersonate/:teacherId` - Start impersonating a teacher
- `POST /api/admin/impersonate/exit` - Stop impersonating
- `GET /api/admin/impersonate/status` - Get current impersonation status

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
- **Read**: Attendance data pulled from assigned sheet range
- **Write**: Only columns D (attendance) and E (notes) can be edited
- Other columns (date, student, time, lesson plan, homework) are protected

## Development

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to database
```

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- Google Calendar connector (configured via Replit integrations)
- Google Sheets connector (configured via Replit integrations)
