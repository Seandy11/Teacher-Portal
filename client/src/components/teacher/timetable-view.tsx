import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Clock, Lock, User, ChevronLeft, ChevronRight, RefreshCw, MapPin, CheckCircle } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, isPast, isToday as isTodayCheck } from "date-fns";
import { useState, useEffect } from "react";
import type { CalendarEvent } from "@shared/schema";

interface TimetableViewProps {
  events: CalendarEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

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

  const formatEventTime = (start: string, end: string) => {
    return `${format(parseISO(start), "HH:mm")} - ${format(parseISO(end), "HH:mm")}`;
  };

  // Check if event has ended
  const isEventPast = (endTime: string) => {
    return isPast(parseISO(endTime));
  };

  // Default color if no colorId
  const defaultEventColor = "#3b82f6";

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-primary" />
          <span className="text-muted-foreground">Scheduled Class</span>
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-7 gap-4">
          {daysOfWeek.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <div key={day.toISOString()} className="min-h-[200px]">
                <div className={`text-center py-2 rounded-t-lg ${isToday ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className="text-xs font-medium uppercase">{format(day, "EEE")}</div>
                  <div className={`text-lg font-medium ${isToday ? "" : "text-foreground"}`}>{format(day, "d")}</div>
                </div>
                
                {/* Current time indicator for today */}
                {isToday && (
                  <div className="relative">
                    <div className="flex items-center gap-1 px-1 py-0.5">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <div className="flex-1 h-0.5 bg-red-500" />
                      <span className="text-xs text-red-500 font-medium">
                        {format(currentTime, "HH:mm")}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2 pt-2">
                  {dayEvents.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No classes
                    </div>
                  ) : (
                    dayEvents.map((event) => {
                      const eventColor = event.backgroundColor || defaultEventColor;
                      const isPastEvent = isEventPast(event.end);
                      
                      return (
                        <Tooltip key={event.id}>
                          <TooltipTrigger asChild>
                            <Card 
                              className={`hover-elevate cursor-pointer transition-opacity ${isPastEvent ? "opacity-50" : ""}`}
                              style={{
                                borderLeftWidth: "4px",
                                borderLeftColor: eventColor,
                              }}
                              data-testid={`card-event-${event.id}`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <Badge 
                                    variant="outline" 
                                    className="text-xs gap-1"
                                    style={{ 
                                      backgroundColor: `${eventColor}20`,
                                      borderColor: eventColor,
                                    }}
                                  >
                                    <Lock className="h-2.5 w-2.5" />
                                    {isPastEvent ? "Completed" : "Class"}
                                  </Badge>
                                </div>
                                <h4 className="font-medium text-sm mb-1 line-clamp-2">{event.title}</h4>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatEventTime(event.start, event.end)}
                                </div>
                              </CardContent>
                            </Card>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="space-y-2">
                              <div className="font-medium">{event.title}</div>
                              <div className="text-sm flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(parseISO(event.start), "EEEE, MMM d")}
                              </div>
                              <div className="text-sm">
                                {formatEventTime(event.start, event.end)}
                              </div>
                              {event.description && (
                                <div className="text-sm text-muted-foreground border-t pt-2 mt-2">
                                  {event.description}
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
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
