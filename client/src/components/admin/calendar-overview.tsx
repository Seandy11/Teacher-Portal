import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Calendar, Lock, Eye, EyeOff, Clock, User, CheckCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO, eachDayOfInterval, isPast } from "date-fns";
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
  const [currentTime, setCurrentTime] = useState(new Date());
  const hasInitialized = useRef(false);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

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

  // Group overlapping events together
  const groupOverlappingEvents = (events: TeacherCalendarEvent[]): TeacherCalendarEvent[][] => {
    if (events.length === 0) return [];
    
    const sorted = [...events].sort((a, b) => 
      new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    
    const groups: TeacherCalendarEvent[][] = [];
    let currentGroup: TeacherCalendarEvent[] = [sorted[0]];
    let groupEnd = new Date(sorted[0].end).getTime();
    
    for (let i = 1; i < sorted.length; i++) {
      const event = sorted[i];
      const eventStart = new Date(event.start).getTime();
      
      if (eventStart < groupEnd) {
        // Overlaps with current group
        currentGroup.push(event);
        groupEnd = Math.max(groupEnd, new Date(event.end).getTime());
      } else {
        // New group
        groups.push(currentGroup);
        currentGroup = [event];
        groupEnd = new Date(event.end).getTime();
      }
    }
    
    groups.push(currentGroup);
    return groups;
  };

  const eventsByDay = useMemo(() => {
    const grouped: Record<string, TeacherCalendarEvent[][]> = {};
    
    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      grouped[dateStr] = [];
    }

    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayEvents = filteredEvents.filter(event => {
        const eventDate = parseISO(event.start);
        return format(eventDate, "yyyy-MM-dd") === dateStr;
      });
      grouped[dateStr] = groupOverlappingEvents(dayEvents);
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
          const dayEventGroups = eventsByDay[dateStr] || [];
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
                {/* Current time indicator for today */}
                {isToday && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    <div className="flex-1 h-0.5 bg-red-500" />
                    <span className="text-xs text-red-500 font-medium whitespace-nowrap">
                      {format(currentTime, "HH:mm")}
                    </span>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-2 pt-0">
                {dayEventGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No events</p>
                ) : (
                  <div className="space-y-1">
                    {dayEventGroups.map((eventGroup, groupIndex) => (
                      <div 
                        key={groupIndex} 
                        className={`flex gap-1 ${eventGroup.length > 1 ? "flex-wrap" : ""}`}
                      >
                        {eventGroup.map((event) => {
                          const isPastEvent = isPast(parseISO(event.end));
                          // Use event's backgroundColor if available, otherwise use teacher color
                          const displayColor = event.backgroundColor || event.teacherColor;
                          
                          return (
                            <Tooltip key={`${event.teacherId}-${event.id}`}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`text-xs p-1.5 rounded cursor-pointer hover-elevate transition-opacity ${isPastEvent ? "opacity-50" : ""} ${eventGroup.length > 1 ? "flex-1 min-w-0" : "w-full"}`}
                                  style={{
                                    backgroundColor: `${displayColor}25`,
                                    borderLeft: `3px solid ${displayColor}`,
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
                                    <User className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{event.teacherName}</span>
                                  </div>
                                  <div className="text-muted-foreground">
                                    {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <div className="space-y-2">
                                  <div className="font-medium">{event.title}</div>
                                  <div className="text-sm flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {event.teacherName}
                                  </div>
                                  <div className="text-sm flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(parseISO(event.start), "EEEE, MMM d")}
                                  </div>
                                  <div className="text-sm">
                                    {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                                  </div>
                                  {event.isAvailabilityBlock && (
                                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                                      <Lock className="h-3 w-3" />
                                      Availability Block
                                    </div>
                                  )}
                                  {isPastEvent && (
                                    <div className="text-sm text-green-600 font-medium flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      Completed
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
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
