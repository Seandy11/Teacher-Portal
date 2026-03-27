import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Clock, Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw, Lock, Unlock } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, addHours, setHours, setMinutes } from "date-fns";
import type { CalendarEvent } from "@shared/schema";

interface AvailabilityManagerProps {
  events: CalendarEvent[];
  isLoading: boolean;
  onCreateBlock: (start: Date, end: Date) => Promise<void>;
  onDeleteBlock: (eventId: string) => Promise<void>;
  onRefresh: () => void;
}

const timeSlots = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export function AvailabilityManager({ events, isLoading, onCreateBlock, onDeleteBlock, onRefresh }: AvailabilityManagerProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const availabilityBlocks = events.filter(e => e.isAvailabilityBlock);
  const classEvents = events.filter(e => !e.isAvailabilityBlock);

  const getEventsForSlot = (day: Date, hour: number) => {
    const slotStart = setMinutes(setHours(day, hour), 0);
    const slotEnd = addHours(slotStart, 1);
    
    const blocks = availabilityBlocks.filter(event => {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);
      return eventStart < slotEnd && eventEnd > slotStart && isSameDay(eventStart, day);
    });

    const classes = classEvents.filter(event => {
      const eventStart = parseISO(event.start);
      const eventEnd = parseISO(event.end);
      return eventStart < slotEnd && eventEnd > slotStart && isSameDay(eventStart, day);
    });

    return { blocks, classes };
  };

  const handleSlotClick = async (day: Date, hour: number) => {
    const { blocks, classes } = getEventsForSlot(day, hour);
    
    if (classes.length > 0) return; // Can't modify slots with classes
    
    if (blocks.length > 0) {
      setDeleteTarget(blocks[0]);
    } else {
      setIsCreating(true);
      try {
        const start = setMinutes(setHours(day, hour), 0);
        const end = addHours(start, 1);
        await onCreateBlock(start, end);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await onDeleteBlock(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Weekly Availability</h2>
          <p className="text-sm text-muted-foreground">Click time slots to block or unblock your availability</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
              data-testid="button-prev-week-avail"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              data-testid="button-next-week-avail"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm font-medium min-w-[160px]" data-testid="text-week-range-avail">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(new Date())}
            data-testid="button-today-avail"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="button-refresh-avail"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-background border" />
          <span className="text-muted-foreground">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-destructive/20 border border-destructive/30" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)", backgroundSize: "8px 8px" }} />
          <span className="text-muted-foreground">Blocked (click to unblock)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-primary" />
          <span className="text-muted-foreground">Class Scheduled</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-8 border-b">
                <div className="p-3 text-center text-sm font-medium text-muted-foreground border-r">
                  Time
                </div>
                {daysOfWeek.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div 
                      key={day.toISOString()} 
                      className={`p-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/10" : ""}`}
                    >
                      <div className="text-xs font-medium uppercase text-muted-foreground">{format(day, "EEE")}</div>
                      <div className={`text-lg font-medium ${isToday ? "text-primary" : ""}`}>{format(day, "d")}</div>
                    </div>
                  );
                })}
              </div>

              {timeSlots.map((hour) => (
                <div key={hour} className="grid grid-cols-8 border-b last:border-b-0">
                  <div className="p-2 text-center text-sm text-muted-foreground border-r flex items-center justify-center">
                    {format(setHours(new Date(), hour), "ha")}
                  </div>
                  {daysOfWeek.map((day) => {
                    const { blocks, classes } = getEventsForSlot(day, hour);
                    const hasBlock = blocks.length > 0;
                    const hasClass = classes.length > 0;
                    const isPast = setHours(day, hour) < new Date();
                    
                    return (
                      <button
                        key={`${day.toISOString()}-${hour}`}
                        onClick={() => !isPast && handleSlotClick(day, hour)}
                        disabled={isPast || isCreating}
                        className={`
                          p-2 border-r last:border-r-0 min-h-[48px] transition-colors relative
                          ${hasClass 
                            ? "bg-primary/20 cursor-not-allowed" 
                            : hasBlock 
                              ? "bg-destructive/10 hover:bg-destructive/20 cursor-pointer" 
                              : "hover:bg-muted cursor-pointer"
                          }
                          ${isPast ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                        style={hasBlock && !hasClass ? {
                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, hsl(var(--destructive) / 0.1) 3px, hsl(var(--destructive) / 0.1) 6px)",
                          backgroundSize: "12px 12px"
                        } : undefined}
                        data-testid={`slot-${format(day, "yyyy-MM-dd")}-${hour}`}
                      >
                        {hasClass && (
                          <div className="flex items-center justify-center gap-1">
                            <Lock className="h-3 w-3 text-primary" />
                            <span className="text-xs text-primary font-medium truncate">{classes[0].title.substring(0, 10)}...</span>
                          </div>
                        )}
                        {hasBlock && !hasClass && (
                          <div className="flex items-center justify-center">
                            <Unlock className="h-3 w-3 text-destructive" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Availability Block?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the blocked time slot and make you available for classes during this time.
              This change will sync to your Google Calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} data-testid="button-confirm-delete">
              {isDeleting ? <LoadingSpinner size="sm" /> : "Remove Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
