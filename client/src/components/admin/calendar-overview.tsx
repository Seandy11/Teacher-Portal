import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft, ChevronRight, Lock, Eye, EyeOff, Clock, User, X,
  Plus, Pencil, Trash2,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay,
  parseISO, eachDayOfInterval, isPast,
} from "date-fns";
import type { CalendarEvent, Teacher } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TeacherCalendarEvent extends CalendarEvent {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
  calendarId: string | null;
}

interface LayoutEvent extends TeacherCalendarEvent {
  column: number;
  totalColumns: number;
}

interface CalendarOverviewProps {
  className?: string;
}

const HOUR_HEIGHT = 48;
const START_HOUR = 7;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const GC_COLORS = [
  { id: "1",  label: "Tomato",     hex: "#D50000" },
  { id: "2",  label: "Flamingo",   hex: "#E67C73" },
  { id: "3",  label: "Tangerine",  hex: "#F4511E" },
  { id: "4",  label: "Banana",     hex: "#F6BF26" },
  { id: "5",  label: "Sage",       hex: "#33B679" },
  { id: "6",  label: "Basil",      hex: "#0B8043" },
  { id: "7",  label: "Peacock",    hex: "#039BE5" },
  { id: "8",  label: "Graphite",   hex: "#616161" },
  { id: "9",  label: "Blueberry",  hex: "#3F51B5" },
  { id: "10", label: "Lavender",   hex: "#7986CB" },
  { id: "11", label: "Grape",      hex: "#8E24AA" },
];

const DURATION_OPTIONS = [
  { value: "30",  label: "30 min" },
  { value: "45",  label: "45 min" },
  { value: "60",  label: "1 hour" },
  { value: "75",  label: "1 h 15 min" },
  { value: "90",  label: "1 h 30 min" },
  { value: "105", label: "1 h 45 min" },
  { value: "120", label: "2 hours" },
];

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

function darkenColor(hexColor: string, amount: number): string {
  const hex = hexColor.replace("#", "");
  const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - amount);
  const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function getEventDurationMinutes(event: TeacherCalendarEvent): number {
  const start = parseISO(event.start).getTime();
  const end = parseISO(event.end).getTime();
  return (end - start) / (1000 * 60);
}

function layoutEvents(events: TeacherCalendarEvent[]): LayoutEvent[] {
  if (events.length === 0) return [];
  const eventTimes = events.map((e) => ({
    event: e,
    key: `${e.teacherId}-${e.id}`,
    start: parseISO(e.start).getTime(),
    end: parseISO(e.end).getTime(),
  }));
  eventTimes.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
  const directOverlaps = new Map<string, Set<string>>();
  for (const et of eventTimes) directOverlaps.set(et.key, new Set());
  for (let i = 0; i < eventTimes.length; i++) {
    for (let j = i + 1; j < eventTimes.length; j++) {
      const a = eventTimes[i];
      const b = eventTimes[j];
      if (a.start < b.end && a.end > b.start) {
        directOverlaps.get(a.key)!.add(b.key);
        directOverlaps.get(b.key)!.add(a.key);
      }
    }
  }
  const columnAssignment = new Map<string, number>();
  const columnEnds: number[] = [];
  for (const et of eventTimes) {
    let column = 0;
    while (column < columnEnds.length && columnEnds[column] > et.start) column++;
    if (column >= columnEnds.length) columnEnds.push(et.end);
    else columnEnds[column] = et.end;
    columnAssignment.set(et.key, column);
  }
  const layoutMap = new Map<string, { column: number; totalColumns: number }>();
  for (const et of eventTimes) {
    const overlappingIds = Array.from(directOverlaps.get(et.key)!);
    const usedColumns = new Set<number>();
    usedColumns.add(columnAssignment.get(et.key)!);
    for (const otherId of overlappingIds) usedColumns.add(columnAssignment.get(otherId)!);
    layoutMap.set(et.key, { column: columnAssignment.get(et.key)!, totalColumns: usedColumns.size });
  }
  return eventTimes.map((et) => ({
    ...et.event,
    column: layoutMap.get(et.key)?.column ?? 0,
    totalColumns: layoutMap.get(et.key)?.totalColumns ?? 1,
  }));
}

// ─── Event Form Dialog ──────────────────────────────────────────────────────

interface EventFormValues {
  title: string;
  teacherId: string;
  date: string;
  startTime: string;
  durationMinutes: string;
  colorId: string;
  recurrence: "none" | "weekly";
}

interface EventFormDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialValues: Partial<EventFormValues>;
  teachers: Teacher[];
  calendarQueryKey: unknown[];
  editEventId?: string;
  editCalendarId?: string;
}

function EventFormDialog({
  open, onClose, mode, initialValues, teachers,
  calendarQueryKey, editEventId, editCalendarId,
}: EventFormDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(initialValues.title ?? "");
  const [teacherId, setTeacherId] = useState(initialValues.teacherId ?? "");
  const [date, setDate] = useState(initialValues.date ?? "");
  const [startTime, setStartTime] = useState(initialValues.startTime ?? "10:00");
  const [durationMinutes, setDurationMinutes] = useState(initialValues.durationMinutes ?? "60");
  const [colorId, setColorId] = useState(initialValues.colorId ?? "7");
  const [recurrence, setRecurrence] = useState<"none" | "weekly">(initialValues.recurrence ?? "none");

  useEffect(() => {
    if (open) {
      setTitle(initialValues.title ?? "");
      setTeacherId(initialValues.teacherId ?? "");
      setDate(initialValues.date ?? "");
      setStartTime(initialValues.startTime ?? "10:00");
      setDurationMinutes(initialValues.durationMinutes ?? "60");
      setColorId(initialValues.colorId ?? "7");
      setRecurrence(initialValues.recurrence ?? "none");
    }
  }, [open]);

  const buildStartDateTime = () => {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const createMutation = useMutation({
    mutationFn: (payload: object) => apiRequest("POST", "/api/admin/calendar/events", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      toast({ title: "Event created", description: `"${title}" added to calendar.` });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create event", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: object) =>
      apiRequest("PATCH", `/api/admin/calendar/events/${editEventId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      toast({ title: "Event updated", description: `"${title}" updated.` });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to update event", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (mode === "create" && !teacherId) {
      toast({ title: "Please select a teacher", variant: "destructive" });
      return;
    }
    if (!date || !startTime) {
      toast({ title: "Date and time required", variant: "destructive" });
      return;
    }
    const startDateTime = buildStartDateTime();
    if (mode === "create") {
      createMutation.mutate({ teacherId, title, startDateTime, durationMinutes: Number(durationMinutes), colorId, recurrence });
    } else {
      updateMutation.mutate({ calendarId: editCalendarId, title, startDateTime, durationMinutes: Number(durationMinutes), colorId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Class Event" : "Edit Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              placeholder="e.g. Lesson with Student Name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-event-title"
            />
          </div>

          {/* Teacher — create only */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Teacher</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger data-testid="select-event-teacher">
                  <SelectValue placeholder="Select teacher…" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.filter((t) => t.isActive && t.calendarId).map((t) => (
                    <SelectItem key={t.id} value={t.id} data-testid={`option-teacher-${t.id}`}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date & Start Time — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-event-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-start-time">Start time</Label>
              <Input
                id="event-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                data-testid="input-event-start-time"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Select value={durationMinutes} onValueChange={setDurationMinutes}>
              <SelectTrigger data-testid="select-event-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2" data-testid="color-picker">
              {GC_COLORS.map((c) => (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setColorId(c.id)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        colorId === c.id ? "border-foreground scale-125" : "border-transparent hover:scale-110"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      data-testid={`color-${c.id}`}
                      aria-label={c.label}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{c.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* Recurrence — create only */}
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Repeat</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as "none" | "weekly")}>
                <SelectTrigger data-testid="select-event-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Once-off</SelectItem>
                  <SelectItem value="weekly">Weekly (same time, every week)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-event">
            {isPending ? <LoadingSpinner className="h-4 w-4 mr-2" /> : null}
            {mode === "create" ? "Add to Calendar" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CalendarOverview({ className }: CalendarOverviewProps) {
  const { toast } = useToast();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [visibleTeacherIds, setVisibleTeacherIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const [frontEventKey, setFrontEventKey] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<Partial<EventFormValues>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<Partial<EventFormValues>>({});
  const [editEventId, setEditEventId] = useState<string | undefined>();
  const [editCalendarId, setEditCalendarId] = useState<string | undefined>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ eventId: string; calendarId: string; title: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const calendarQueryKey = ["/api/admin/calendar/all", currentWeekStart.toISOString(), weekEnd.toISOString()];

  const { data: events = [], isLoading, error, refetch } = useQuery<TeacherCalendarEvent[]>({
    queryKey: calendarQueryKey,
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/calendar/all?timeMin=${currentWeekStart.toISOString()}&timeMax=${weekEnd.toISOString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch calendar events");
      return response.json();
    },
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["/api/admin/teachers"],
  });

  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  const teacherList = useMemo(() => {
    const teacherMap = new Map<string, { name: string; color: string }>();
    for (const event of events) {
      if (!teacherMap.has(event.teacherId))
        teacherMap.set(event.teacherId, { name: event.teacherName, color: event.teacherColor });
    }
    return Array.from(teacherMap.entries()).map(([id, data]) => ({ id, ...data }));
  }, [events]);

  useEffect(() => {
    if (teacherList.length > 0) {
      if (!hasInitialized.current) {
        setVisibleTeacherIds(new Set(teacherList.map((t) => t.id)));
        hasInitialized.current = true;
      } else {
        setVisibleTeacherIds((prev) => {
          const next = new Set(prev);
          for (const teacher of teacherList) {
            if (!prev.has(teacher.id)) next.add(teacher.id);
          }
          return next;
        });
      }
    }
  }, [teacherList]);

  const filteredEvents = useMemo(
    () => events.filter((event) => visibleTeacherIds.has(event.teacherId)),
    [events, visibleTeacherIds]
  );

  const getEventsForDay = (day: Date): LayoutEvent[] => {
    const dayEvents = filteredEvents.filter((event) => isSameDay(parseISO(event.start), day));
    return layoutEvents(dayEvents);
  };

  const getEventStyle = (event: TeacherCalendarEvent) => {
    const startTime = parseISO(event.start);
    const endTime = parseISO(event.end);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    return {
      top: `${(startHour - START_HOUR) * HOUR_HEIGHT}px`,
      height: `${Math.max((endHour - startHour) * HOUR_HEIGHT, 24)}px`,
    };
  };

  const currentTimePosition = useMemo(() => {
    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    if (hour < START_HOUR || hour > END_HOUR) return null;
    return (hour - START_HOUR) * HOUR_HEIGHT;
  }, [currentTime]);

  const toggleTeacher = (teacherId: string) => {
    setVisibleTeacherIds((prev) => {
      const next = new Set(prev);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  };

  const handleEventClick = useCallback(
    (eventKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (frontEventKey === eventKey) {
        setSelectedEventKey((prev) => (prev === eventKey ? null : eventKey));
      } else {
        setFrontEventKey(eventKey);
        setSelectedEventKey(eventKey);
      }
    },
    [frontEventKey]
  );

  const handleSlotClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    // Don't open if clicking on an existing event (events call stopPropagation)
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const totalHoursOffset = clickY / HOUR_HEIGHT;
    let hours = Math.floor(START_HOUR + totalHoursOffset);
    let minutes = Math.round(((totalHoursOffset % 1) * 60) / 15) * 15;
    if (minutes >= 60) { hours += 1; minutes = 0; }
    hours = Math.min(hours, END_HOUR);
    const startTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const dateStr = format(day, "yyyy-MM-dd");

    // Auto-select teacher if only one is visible
    const singleVisibleTeacher = visibleTeacherIds.size === 1
      ? Array.from(visibleTeacherIds)[0]
      : "";

    setCreateInitial({
      date: dateStr,
      startTime,
      teacherId: singleVisibleTeacher,
      durationMinutes: "60",
      colorId: "7",
      recurrence: "none",
    });
    setCreateOpen(true);
  };

  const selectedEvent = useMemo(
    () => (selectedEventKey ? filteredEvents.find((e) => `${e.teacherId}-${e.id}` === selectedEventKey) ?? null : null),
    [selectedEventKey, filteredEvents]
  );

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ eventId, calendarId }: { eventId: string; calendarId: string }) =>
      apiRequest("DELETE", `/api/admin/calendar/events/${eventId}?calendarId=${encodeURIComponent(calendarId)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarQueryKey });
      toast({ title: "Event deleted" });
      setSelectedEventKey(null);
      setFrontEventKey(null);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete event", description: err?.message, variant: "destructive" });
      setDeleteConfirmOpen(false);
    },
  });

  const openEdit = (event: TeacherCalendarEvent) => {
    const startDt = parseISO(event.start);
    const endDt = parseISO(event.end);
    const durationMs = endDt.getTime() - startDt.getTime();
    const durationMin = String(Math.round(durationMs / 60000));
    const closestDuration = DURATION_OPTIONS.map((o) => o.value).reduce((prev, curr) =>
      Math.abs(Number(curr) - Number(durationMin)) < Math.abs(Number(prev) - Number(durationMin)) ? curr : prev
    );
    setEditInitial({
      title: event.title,
      date: format(startDt, "yyyy-MM-dd"),
      startTime: format(startDt, "HH:mm"),
      durationMinutes: closestDuration,
      colorId: event.colorId ?? "7",
    });
    setEditEventId(event.id);
    setEditCalendarId(event.calendarId ?? undefined);
    setEditOpen(true);
  };

  const openDelete = (event: TeacherCalendarEvent) => {
    if (!event.calendarId) {
      toast({ title: "Cannot delete: no calendar ID", variant: "destructive" });
      return;
    }
    setDeleteTarget({ eventId: event.id, calendarId: event.calendarId, title: event.title });
    setDeleteConfirmOpen(true);
  };

  const goToPreviousWeek = () => setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  const goToNextWeek = () => setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load calendar"
        message="Could not fetch teacher calendars. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Nav row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek} data-testid="button-prev-week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToCurrentWeek} data-testid="button-current-week">
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm ml-2">
            {format(currentWeekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
        </div>
        <Button
          onClick={() => {
            setCreateInitial({ durationMinutes: "60", colorId: "7", recurrence: "none" });
            setCreateOpen(true);
          }}
          data-testid="button-add-event"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      {/* Teacher filters */}
      {teacherList.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-sm font-medium">Teacher Calendars</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setVisibleTeacherIds(new Set(teacherList.map((t) => t.id)))} data-testid="button-select-all-teachers">
                  <Eye className="h-3 w-3 mr-1" /> Show All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVisibleTeacherIds(new Set())} data-testid="button-clear-all-teachers">
                  <EyeOff className="h-3 w-3 mr-1" /> Hide All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="flex flex-wrap gap-3">
              {teacherList.map((teacher) => {
                const isVisible = visibleTeacherIds.has(teacher.id);
                return (
                  <label
                    key={teacher.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer hover-elevate border ${isVisible ? "border-border" : "opacity-50 border-transparent"}`}
                    style={{ backgroundColor: isVisible ? `${teacher.color}15` : undefined }}
                    data-testid={`toggle-teacher-${teacher.id}`}
                  >
                    <Checkbox
                      checked={isVisible}
                      onCheckedChange={() => toggleTeacher(teacher.id)}
                      data-testid={`checkbox-teacher-${teacher.id}`}
                    />
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: teacher.color }} />
                    <span className="text-sm font-medium">{teacher.name}</span>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Event Details Panel */}
      {selectedEvent && (
        <Card data-testid="panel-event-details">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: selectedEvent.backgroundColor || selectedEvent.teacherColor }}
                />
                <CardTitle className="text-sm font-medium">{selectedEvent.title}</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEdit(selectedEvent)}
                  data-testid="button-edit-event"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => openDelete(selectedEvent)}
                  data-testid="button-delete-event"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setSelectedEventKey(null); setFrontEventKey(null); }}
                  data-testid="button-close-event-details"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 flex-shrink-0" />
                <span>{selectedEvent.teacherName}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>
                  {format(parseISO(selectedEvent.start), "EEEE, MMM d")} &middot;{" "}
                  {format(parseISO(selectedEvent.start), "HH:mm")} – {format(parseISO(selectedEvent.end), "HH:mm")}
                </span>
              </div>
              {selectedEvent.isAvailabilityBlock && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="h-4 w-4 flex-shrink-0" />
                  <span>Availability Block</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline Calendar Grid */}
      <div
        className="border rounded-lg overflow-hidden"
        onClick={() => { setSelectedEventKey(null); setFrontEventKey(null); }}
      >
        {/* Header row */}
        <div className="flex border-b bg-muted/50">
          <div className="w-14 flex-shrink-0 border-r" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 text-center py-2 border-r last:border-r-0 min-w-[120px] ${isToday ? "bg-primary text-primary-foreground" : ""}`}
              >
                <div className="text-xs font-medium uppercase">{format(day, "EEE")}</div>
                <div className="text-lg font-medium">{format(day, "d")}</div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="flex overflow-x-auto">
          {/* Time labels */}
          <div className="w-14 flex-shrink-0 border-r bg-muted/30">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b last:border-b-0 text-xs text-muted-foreground pr-2 text-right"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="relative -top-2">{String(hour).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={day.toISOString()}
                className="flex-1 relative border-r last:border-r-0 min-w-[120px] cursor-crosshair"
                style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
                onClick={(e) => handleSlotClick(day, e)}
                data-testid={`day-column-${format(day, "yyyy-MM-dd")}`}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-b border-dashed border-muted"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && currentTimePosition !== null && (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                    style={{ top: `${currentTimePosition}px` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 animate-pulse" />
                    <div className="flex-1 h-0.5 bg-red-500" />
                  </div>
                )}

                {/* Events */}
                {dayEvents.map((event) => {
                  const eventKey = `${event.teacherId}-${event.id}`;
                  const displayColor = event.backgroundColor || event.teacherColor;
                  const borderColor = darkenColor(displayColor, 50);
                  const isPastEvent = isPast(parseISO(event.end));
                  const style = getEventStyle(event);
                  const durationMinutes = getEventDurationMinutes(event);
                  const isFront = frontEventKey === eventKey;
                  const isSelected = selectedEventKey === eventKey;

                  const minWidthPx = 28;
                  const colWidth = 100 / event.totalColumns;
                  const width = event.totalColumns > 1 ? `max(${minWidthPx}px, ${colWidth}%)` : "100%";
                  const left = `${(event.column * 100) / event.totalColumns}%`;

                  const showTeacher = durationMinutes >= 25;
                  const showTime = durationMinutes >= 35;

                  return (
                    <Tooltip key={eventKey}>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute rounded-sm cursor-pointer overflow-hidden text-xs p-1 transition-all duration-150 ${isPastEvent ? "opacity-50" : ""} ${isSelected ? "ring-2 ring-foreground/40" : ""}`}
                          style={{
                            ...style,
                            width,
                            left,
                            backgroundColor: displayColor,
                            color: getContrastColor(displayColor),
                            border: `1.5px solid ${borderColor}`,
                            boxShadow: isFront ? "0 4px 12px rgba(0,0,0,0.25)" : "0 1px 3px rgba(0,0,0,0.15)",
                            zIndex: isFront ? 30 : 10,
                          }}
                          onClick={(e) => handleEventClick(eventKey, e)}
                          data-testid={`event-${event.id}`}
                        >
                          <div className="font-medium truncate leading-tight text-[10px]">{event.title}</div>
                          {showTeacher && (
                            <div className="truncate opacity-80 leading-tight text-[10px]">{event.teacherName}</div>
                          )}
                          {showTime && (
                            <div className="truncate opacity-80 leading-tight text-[10px]">
                              {format(parseISO(event.start), "HH:mm")}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs z-50">
                        <div className="space-y-1">
                          <div className="font-medium">{event.title}</div>
                          <div className="text-sm flex items-center gap-1 text-muted-foreground">
                            <User className="h-3 w-3" /> {event.teacherName}
                          </div>
                          <div className="text-sm flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(event.start), "EEEE, MMM d")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(parseISO(event.start), "HH:mm")} – {format(parseISO(event.end), "HH:mm")}
                          </div>
                          {event.isAvailabilityBlock && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Availability Block
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground pt-1 italic">Click to select • Use Edit/Delete from panel</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Event Dialog */}
      <EventFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        initialValues={createInitial}
        teachers={teachers}
        calendarQueryKey={calendarQueryKey}
      />

      {/* Edit Event Dialog */}
      <EventFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initialValues={editInitial}
        teachers={teachers}
        calendarQueryKey={calendarQueryKey}
        editEventId={editEventId}
        editCalendarId={editCalendarId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently removed from Google Calendar. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
