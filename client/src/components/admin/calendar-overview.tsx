import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Calendar, Lock } from "lucide-react";
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

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, TeacherCalendarEvent[]> = {};
    
    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      grouped[dateStr] = [];
    }

    for (const event of events) {
      const eventDate = parseISO(event.start);
      const dateStr = format(eventDate, "yyyy-MM-dd");
      if (grouped[dateStr]) {
        grouped[dateStr].push(event);
      }
    }

    return grouped;
  }, [events, weekDays]);

  const teacherLegend = useMemo(() => {
    const teacherMap = new Map<string, { name: string; color: string }>();
    for (const event of events) {
      if (!teacherMap.has(event.teacherId)) {
        teacherMap.set(event.teacherId, { name: event.teacherName, color: event.teacherColor });
      }
    }
    return Array.from(teacherMap.entries()).map(([id, data]) => ({ id, ...data }));
  }, [events]);

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

      {teacherLegend.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {teacherLegend.map((teacher) => (
            <Badge
              key={teacher.id}
              variant="outline"
              className="text-xs"
              style={{ borderColor: teacher.color, color: teacher.color }}
              data-testid={`legend-teacher-${teacher.id}`}
            >
              <span
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: teacher.color }}
              />
              {teacher.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay[dateStr] || [];
          const isToday = isSameDay(day, new Date());
          
          return (
            <Card
              key={dateStr}
              className={`min-h-[180px] ${isToday ? "ring-2 ring-primary" : ""}`}
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
                <ScrollArea className="h-[120px]">
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
                </ScrollArea>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
