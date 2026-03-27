# Teacher Portal Design Guidelines

## Design Approach
**System**: Material Design 3 (modern, information-dense productivity focus)  
**Rationale**: Internal tool requiring clear data hierarchy, strong feedback mechanisms, and efficient task completion. Material's elevated surfaces and responsive states excel for calendar/table-heavy interfaces.

**Key Principles**:
- Clarity over decoration - every element serves the teacher's workflow
- Quick recognition - teachers should immediately know where they are and what they can do
- Contextual feedback - clear distinction between read-only vs. editable elements

---

## Typography
**Font**: Google Fonts - Roboto (system font)
- **Headings**: Roboto Medium, sizes: text-2xl (page titles), text-xl (section headers), text-lg (subsections)
- **Body**: Roboto Regular, text-base for content, text-sm for metadata/captions
- **Data Tables**: Roboto Mono for numeric data, Roboto Regular for text columns
- **Interactive Elements**: Roboto Medium for buttons, text-sm for helper text

---

## Layout System
**Spacing Units**: Tailwind 4, 6, 8, 12 (focus on rhythm and breathing room)
- Section padding: p-6 to p-8
- Card/component spacing: space-y-4 or space-y-6 between elements
- Form fields: space-y-4
- Table cell padding: px-4 py-3

**Grid Structure**:
- Container: max-w-7xl mx-auto px-4
- Dashboard: 2-column responsive grid (lg:grid-cols-3 for stats/widgets)
- Calendar: Full-width with collapsible sidebar (filter/legend)

---

## Component Library

### Navigation
**Top App Bar**: Fixed header with logo, teacher name/role badge, logout
**Side Navigation** (Admin only): Collapsible drawer for Teachers Management, Leave Requests
**Teacher View**: Tab-based navigation (My Timetable | Attendance | Availability | Leave)

### Calendar Components
**Timetable View**: 
- Week grid with time slots (rows) and days (columns)
- Read-only class events: elevated cards with student name, time, lesson type
- Visual lock icon for non-editable events
- Compact daily view for mobile

**Availability Manager**:
- Interactive calendar grid
- Toggle blocks: Click to block/unblock with immediate visual feedback
- Blocked slots: distinct treatment (diagonal stripes pattern)
- Color-coded legend: Available, Blocked, Class Scheduled

### Data Tables
**Attendance Tracker**:
- Sortable columns with header controls
- Row highlighting on hover
- Editable cells: inline edit with clear visual boundary (border treatment)
- Protected columns: muted appearance with lock icon in header
- Quick filters: date range, student name

**Admin Teacher List**:
- Multi-column table: Name, Email, Status (Active/Inactive), Assigned Calendar, Actions
- Inline action buttons: Edit, Deactivate/Activate
- Search/filter bar above table

### Forms
**Leave Submission**:
- Single-column form layout
- Date range picker (from/to)
- Leave type dropdown
- Reason textarea
- Submit button with loading state

**Teacher Assignment** (Admin):
- Multi-step form or modal
- Teacher select, Calendar mapping, Sheet row assignment
- Validation feedback inline

### Feedback Elements
**Status Indicators**:
- Success/error toast notifications (top-right)
- Loading spinners for async operations
- Empty states with helpful guidance ("No classes scheduled this week")
- Confirmation dialogs for destructive actions

### Cards & Surfaces
**Dashboard Stats Cards** (Admin):
- Grid of metric cards: Total Teachers, Active Classes, Pending Leave
- Elevated surface with icon, number, label

**Information Cards**:
- Elevation level 1 for primary content containers
- Subtle borders for nested sections
- Rounded corners: rounded-lg

---

## Accessibility
- Focus indicators on all interactive elements (ring-2 ring-offset-2)
- Semantic HTML throughout (proper heading hierarchy, table structure)
- ARIA labels for icon-only buttons
- Keyboard navigation for calendar and table interactions
- High contrast for read-only vs editable states

---

## Animations
**Minimal & Purposeful**:
- Drawer slide-in: 200ms ease-out
- Toast notifications: fade + slide from top
- Loading states: subtle pulse on skeleton screens
- Tab transitions: instant (no animation)
- NO decorative animations

---

## Images
**No hero images** - this is a functional internal tool  
**Icons only**: Material Icons CDN for actions (edit, delete, calendar, lock, check)

---

## Key Layout Decisions
- **Teacher Dashboard**: Tab layout above content area, current tab highlighted
- **Admin Dashboard**: Sidebar + main content area with stats cards at top
- **Mobile**: Bottom tab bar for teachers, hamburger menu for admin
- **Density**: Information-dense but not cramped - strategic whitespace between functional groups