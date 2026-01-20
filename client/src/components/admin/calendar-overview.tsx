import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { ChevronLeft, ChevronRight, Calendar, Lock, Eye, EyeOff } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO, eachDayOfInterval } from "date-fns";
import type { CalendarEvent } from "@shared/schema";

interface TeacherCalendarEvent extends CalendarEvent {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
}

interface CalendarOverviewProps {
  className?: string;
}

export function CalendarOverview({ className }: CalendarOverviewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [visibleTeacherIds, setVisibleTeacherIds] = useState<Set<string>>(new Set());
  const hasInitialized = useRef(false);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  
  const { data: events = [], isLoading, error, refetch } = useQuery<TeacherCalendarEvent[]>({
    queryKey: ["/api/admin/calendar/all", currentWeekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const response = await fetch(
        `/api/admin/calendar/all?timeMin=${currentWeekStart.toISOString()}&timeMax=${weekEnd.toISOString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch calendar events");
      }
      return response.json();
    },
  });

  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd });

  const teacherList = useMemo(() => {
    const teacherMap = new Map<string, { name: string; color: string }>();
    for (const event of events) {
      if (!teacherMap.has(event.teacherId)) {
        teacherMap.set(event.teacherId, { name: event.teacherName, color: event.teacherColor });
      }
    }
    return Array.from(teacherMap.entries()).map(([id, data]) => ({ id, ...data }));
  }, [events]);

  useEffect(() => {
    if (teacherList.length > 0) {
      if (!hasInitialized.current) {
        setVisibleTeacherIds(new Set(teacherList.map(t => t.id)));
        hasInitialized.current = true;
      } else {
        setVisibleTeacherIds(prev => {
          const next = new Set(prev);
          for (const teacher of teacherList) {
            if (!prev.has(teacher.id)) {
              next.add(teacher.id);
            }
          }
          return next;
        });
      }
    }
  }, [teacherList]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => visibleTeacherIds.has(event.teacherId));
  }, [events, visibleTeacherIds]);

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, TeacherCalendarEvent[]> = {};
    
    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      grouped[dateStr] = [];
    }

    for (const event of filteredEvents) {
      const eventDate = parseISO(event.start);
      const dateStr = format(eventDate, "yyyy-MM-dd");
      if (grouped[dateStr]) {
        grouped[dateStr].push(event);
      }
    }

    return grouped;
  }, [filteredEvents, weekDays]);

  const toggleTeacher = (teacherId: string) => {
    setVisibleTeacherIds(prev => {
      const next = new Set(prev);
      if (next.has(teacherId)) {
        next.delete(teacherId);
      } else {
        next.add(teacherId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setVisibleTeacherIds(new Set(teacherList.map(t => t.id)));
  };

  const clearAll = () => {
    setVisibleTeacherIds(new Set());
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousWeek}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={goToCurrentWeek}
            data-testid="button-current-week"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextWeek}
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium text-sm ml-2">
            {format(currentWeekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </span>
        </div>
      </div>

      {teacherList.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-sm font-medium">Teacher Calendars</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  data-testid="button-select-all-teachers"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Show All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  data-testid="button-clear-all-teachers"
                >
                  <EyeOff className="h-3 w-3 mr-1" />
                  Hide All
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer hover-elevate border ${
                      isVisible ? "border-border" : "opacity-50 border-transparent"
                    }`}
                    style={{
                      backgroundColor: isVisible ? `${teacher.color}15` : undefined,
                    }}
                    data-testid={`toggle-teacher-${teacher.id}`}
                  >
                    <Checkbox
                      checked={isVisible}
                      onCheckedChange={() => toggleTeacher(teacher.id)}
                      data-testid={`checkbox-teacher-${teacher.id}`}
                    />
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: teacher.color }}
                    />
                    <span className="text-sm font-medium">{teacher.name}</span>
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay[dateStr] || [];
          const isToday = isSameDay(day, new Date());
          
          return (
            <Card
              key={dateStr}
              className={`${isToday ? "ring-2 ring-primary" : ""}`}
              data-testid={`calendar-day-${dateStr}`}
            >
              <CardHeader className="py-2 px-3">
                <CardTitle className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  <span className="block">{format(day, "EEE")}</span>
                  <span className={`text-lg font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No events</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <div
                        key={`${event.teacherId}-${event.id}`}
                        className="text-xs p-1.5 rounded"
                        style={{
                          backgroundColor: `${event.teacherColor}20`,
                          borderLeft: `3px solid ${event.teacherColor}`,
                        }}
                        data-testid={`event-${event.id}`}
                      >
                        <div className="flex items-center gap-1">
                          {event.isAvailabilityBlock && (
                            <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="font-medium truncate" title={event.title}>
                            {event.title}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{event.teacherName}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
