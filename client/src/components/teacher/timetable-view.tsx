import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Calendar, Clock, Lock, User, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { useState } from "react";
import type { CalendarEvent } from "@shared/schema";

interface TimetableViewProps {
  events: CalendarEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function TimetableView({ events, isLoading, onRefresh }: TimetableViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  
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
                
                <div className="space-y-2 pt-2">
                  {dayEvents.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No classes
                    </div>
                  ) : (
                    dayEvents.map((event) => (
                      <Card key={event.id} className="hover-elevate" data-testid={`card-event-${event.id}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <Badge variant="outline" className="text-xs gap-1">
                              <Lock className="h-2.5 w-2.5" />
                              Class
                            </Badge>
                          </div>
                          <h4 className="font-medium text-sm mb-1 line-clamp-2">{event.title}</h4>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatEventTime(event.start, event.end)}
                          </div>
                          {event.description && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <User className="h-3 w-3" />
                              <span className="line-clamp-1">{event.description}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
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
