import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Clock, ChevronLeft, ChevronRight, RefreshCw, Lock } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, isPast } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import type { CalendarEvent } from "@shared/schema";

interface TimetableViewProps {
  events: CalendarEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 7; // 07:00
const END_HOUR = 20; // 20:00
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

export function TimetableView({ events, isLoading, onRefresh }: TimetableViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const classEvents = events.filter(e => !e.isAvailabilityBlock);

  const getEventsForDay = (day: Date) => {
    return classEvents.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, day);
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  // Calculate event position and height based on time
  const getEventStyle = (event: CalendarEvent) => {
    const startTime = parseISO(event.start);
    const endTime = parseISO(event.end);
    
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    const top = (startHour - START_HOUR) * HOUR_HEIGHT;
    const height = (endHour - startHour) * HOUR_HEIGHT;
    
    return {
      top: `${top}px`,
      height: `${Math.max(height, 30)}px`, // Minimum 30px height
    };
  };

  // Calculate current time indicator position
  const currentTimePosition = useMemo(() => {
    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    if (hour < START_HOUR || hour > END_HOUR) return null;
    return (hour - START_HOUR) * HOUR_HEIGHT;
  }, [currentTime]);

  // Default color if no backgroundColor
  const defaultEventColor = "#3b82f6";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <h2 className="text-lg font-medium" data-testid="text-week-range">
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </h2>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(new Date())}
            data-testid="button-today"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="button-refresh-timetable"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Lock className="h-3 w-3" />
          <span>Read-only (synced from Calendar)</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : classEvents.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No Classes Scheduled"
          description="You don't have any classes scheduled for this week. Check back later or contact your administrator."
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Header row with days */}
          <div className="flex border-b bg-muted/50">
            {/* Time column header */}
            <div className="w-16 flex-shrink-0 border-r" />
            
            {/* Day headers */}
            {daysOfWeek.map((day) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div 
                  key={day.toISOString()} 
                  className={`flex-1 text-center py-2 border-r last:border-r-0 ${isToday ? "bg-primary text-primary-foreground" : ""}`}
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
            <div className="w-16 flex-shrink-0 border-r">
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
            {daysOfWeek.map((day) => {
              const dayEvents = getEventsForDay(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <div 
                  key={day.toISOString()} 
                  className="flex-1 relative border-r last:border-r-0 min-w-[100px]"
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
                  {dayEvents.map((event, index) => {
                    const eventColor = event.backgroundColor || defaultEventColor;
                    const isPastEvent = isPast(parseISO(event.end));
                    const style = getEventStyle(event);
                    
                    // Check for overlapping events to adjust width
                    const overlapping = dayEvents.filter((e, i) => {
                      if (i === index) return false;
                      const eStart = parseISO(e.start).getTime();
                      const eEnd = parseISO(e.end).getTime();
                      const thisStart = parseISO(event.start).getTime();
                      const thisEnd = parseISO(event.end).getTime();
                      return (thisStart < eEnd && thisEnd > eStart);
                    });
                    
                    const overlapIndex = dayEvents.slice(0, index).filter(e => {
                      const eStart = parseISO(e.start).getTime();
                      const eEnd = parseISO(e.end).getTime();
                      const thisStart = parseISO(event.start).getTime();
                      const thisEnd = parseISO(event.end).getTime();
                      return (thisStart < eEnd && thisEnd > eStart);
                    }).length;
                    
                    const totalOverlaps = overlapping.length + 1;
                    const width = totalOverlaps > 1 ? `${100 / totalOverlaps}%` : '100%';
                    const left = totalOverlaps > 1 ? `${(overlapIndex * 100) / totalOverlaps}%` : '0';
                    
                    return (
                      <Tooltip key={event.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute rounded-sm cursor-pointer overflow-hidden text-xs p-1 transition-opacity ${isPastEvent ? "opacity-50" : ""}`}
                            style={{
                              ...style,
                              width,
                              left,
                              backgroundColor: eventColor,
                              color: getContrastColor(eventColor),
                              zIndex: 10,
                            }}
                            data-testid={`event-${event.id}`}
                          >
                            <div className="font-medium truncate leading-tight">{event.title}</div>
                            <div className="truncate opacity-90 leading-tight">
                              {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs z-50">
                          <div className="space-y-1">
                            <div className="font-medium">{event.title}</div>
                            <div className="text-sm flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {format(parseISO(event.start), "EEEE, MMM d")}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {format(parseISO(event.start), "HH:mm")} - {format(parseISO(event.end), "HH:mm")}
                            </div>
                            {event.description && (
                              <div className="text-sm text-muted-foreground border-t pt-1 mt-1">
                                {event.description}
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
      )}
    </div>
  );
}

// Helper function to get contrasting text color
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black or white based on luminance
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
