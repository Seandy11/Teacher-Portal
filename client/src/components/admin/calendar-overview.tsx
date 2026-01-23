import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Lock, Eye, EyeOff, Clock, User } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay, parseISO, eachDayOfInterval, isPast } from "date-fns";
import type { CalendarEvent } from "@shared/schema";

interface TeacherCalendarEvent extends CalendarEvent {
  teacherId: string;
  teacherName: string;
  teacherColor: string;
}

interface LayoutEvent extends TeacherCalendarEvent {
  column: number;
  totalColumns: number;
}

interface CalendarOverviewProps {
  className?: string;
}

const HOUR_HEIGHT = 48; // pixels per hour
const START_HOUR = 7; // 07:00
const END_HOUR = 20; // 20:00
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

// Helper function to get contrasting text color
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Get event duration in minutes
function getEventDurationMinutes(event: TeacherCalendarEvent): number {
  const start = parseISO(event.start).getTime();
  const end = parseISO(event.end).getTime();
  return (end - start) / (1000 * 60);
}

// Calculate concurrent overlaps - each event gets width based on its direct overlaps only
function layoutEvents(events: TeacherCalendarEvent[]): LayoutEvent[] {
  if (events.length === 0) return [];
  
  // Parse times once and include unique key for each event
  const eventTimes = events.map(e => ({
    event: e,
    key: `${e.teacherId}-${e.id}`,
    start: parseISO(e.start).getTime(),
    end: parseISO(e.end).getTime(),
  }));
  
  // Sort by start time, then by duration (longer first)
  eventTimes.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });
  
  // For each event, find all events that directly overlap with it
  const directOverlaps = new Map<string, Set<string>>();
  for (const et of eventTimes) {
    directOverlaps.set(et.key, new Set());
  }
  
  for (let i = 0; i < eventTimes.length; i++) {
    for (let j = i + 1; j < eventTimes.length; j++) {
      const a = eventTimes[i];
      const b = eventTimes[j];
      // Check overlap: a starts before b ends AND a ends after b starts
      if (a.start < b.end && a.end > b.start) {
        directOverlaps.get(a.key)!.add(b.key);
        directOverlaps.get(b.key)!.add(a.key);
      }
    }
  }
  
  // Assign columns using greedy algorithm
  const columnAssignment = new Map<string, number>();
  const columnEnds: number[] = [];
  
  for (const et of eventTimes) {
    // Find first column where the last event ended before or at this event's start
    let column = 0;
    while (column < columnEnds.length && columnEnds[column] > et.start) {
      column++;
    }
    
    if (column >= columnEnds.length) {
      columnEnds.push(et.end);
    } else {
      columnEnds[column] = et.end;
    }
    
    columnAssignment.set(et.key, column);
  }
  
  // For each event, calculate totalColumns based on its direct overlaps
  const layoutMap = new Map<string, { column: number; totalColumns: number }>();
  
  for (const et of eventTimes) {
    const overlappingIds = Array.from(directOverlaps.get(et.key)!);
    
    // Find actual columns used by this event and its overlapping events
    const usedColumns = new Set<number>();
    usedColumns.add(columnAssignment.get(et.key)!);
    for (const otherId of overlappingIds) {
      usedColumns.add(columnAssignment.get(otherId)!);
    }
    
    const totalColumns = usedColumns.size;
    layoutMap.set(et.key, {
      column: columnAssignment.get(et.key)!,
      totalColumns,
    });
  }
  
  // Return events with layout info
  return eventTimes.map(et => ({
    ...et.event,
    column: layoutMap.get(et.key)?.column ?? 0,
    totalColumns: layoutMap.get(et.key)?.totalColumns ?? 1,
  }));
}

export function CalendarOverview({ className }: CalendarOverviewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [visibleTeacherIds, setVisibleTeacherIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const hasInitialized = useRef(false);

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

  // Get events for a specific day with layout info
  const getEventsForDay = (day: Date): LayoutEvent[] => {
    const dayEvents = filteredEvents.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, day);
    });
    return layoutEvents(dayEvents);
  };

  // Calculate event position and height based on time
  const getEventStyle = (event: TeacherCalendarEvent) => {
    const startTime = parseISO(event.start);
    const endTime = parseISO(event.end);
    
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    
    return {
      top: `${top}px`,
      height: `${Math.max(height, 24)}px`,
    };
  };

  // Calculate current time indicator position
  const currentTimePosition = useMemo(() => {
    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    if (hour < START_HOUR || hour > END_HOUR) return null;
    return (hour - START_HOUR) * HOUR_HEIGHT;
  }, [currentTime]);

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

      {/* Timeline Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header row with days */}
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
          {/* Time labels column */}
          <div className="w-14 flex-shrink-0 border-r bg-muted/30">
            {HOURS.map((hour) => (
              <div 
                key={hour} 
                className="border-b last:border-b-0 text-xs text-muted-foreground pr-2 text-right"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="relative -top-2">{String(hour).padStart(2, '0')}:00</span>
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
                className="flex-1 relative border-r last:border-r-0 min-w-[120px]"
                style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
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
                  const displayColor = event.backgroundColor || event.teacherColor;
                  const isPastEvent = isPast(parseISO(event.end));
                  const style = getEventStyle(event);
                  const durationMinutes = getEventDurationMinutes(event);
                  
                  // Use pre-calculated layout
                  const width = `${100 / event.totalColumns}%`;
                  const left = `${(event.column * 100) / event.totalColumns}%`;
                  
                  // Adaptive content based on duration
                  const showTeacher = durationMinutes >= 25;
                  const showTime = durationMinutes >= 35;
                  
                  return (
                    <Tooltip key={`${event.teacherId}-${event.id}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={`absolute rounded-sm cursor-pointer overflow-hidden text-xs p-1 transition-opacity ${isPastEvent ? "opacity-50" : ""}`}
                          style={{
                            ...style,
                            width,
                            left,
                            backgroundColor: displayColor,
                            color: getContrastColor(displayColor),
                            zIndex: 10,
                          }}
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
                            <User className="h-3 w-3" />
                            {event.teacherName}
                          </div>
                          <div className="text-sm flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(event.start), "EEEE, MMM d")}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                          </div>
                          {event.isAvailabilityBlock && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Availability Block
                            </div>
                          )}
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
    </div>
  );
}
