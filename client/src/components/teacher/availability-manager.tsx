import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Calendar, ChevronLeft, ChevronRight, RefreshCw, Lock, Unlock, WifiOff } from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, addHours, setHours, setMinutes } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CalendarEvent } from "@shared/schema";

const timeSlots = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export function AvailabilityManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const timeMin = subWeeks(weekStart, 0).toISOString();
  const timeMax = addWeeks(weekEnd, 0).toISOString();

  const { data: events = [], isLoading, error, refetch } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events/availability", timeMin, timeMax],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Error ${res.status}`);
      }
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ start, end }: { start: Date; end: Date }) => {
      return apiRequest("POST", "/api/calendar/availability", {
        start: start.toISOString(),
        end: end.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events/availability"] });
      toast({ title: "Time slot blocked" });
    },
    onError: (err: any) => {
      toast({
        title: "Could not block time slot",
        description: err.message || "Check that your Google Calendar is connected and a calendar is assigned.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("DELETE", `/api/calendar/availability/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events/availability"] });
      toast({ title: "Time slot unblocked" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({
        title: "Could not unblock time slot",
        description: err.message || "Check that your Google Calendar is connected.",
        variant: "destructive",
      });
      setDeleteTarget(null);
    },
  });

  const availabilityBlocks = events.filter(e => e.isAvailabilityBlock);
  const classEvents = events.filter(e => !e.isAvailabilityBlock);

  const getEventsForSlot = (day: Date, hour: number) => {
    const slotStart = setMinutes(setHours(day, hour), 0);
    const slotEnd = addHours(slotStart, 1);
    const blocks = availabilityBlocks.filter(e => {
      const s = parseISO(e.start), en = parseISO(e.end);
      return s < slotEnd && en > slotStart && isSameDay(s, day);
    });
    const classes = classEvents.filter(e => {
      const s = parseISO(e.start), en = parseISO(e.end);
      return s < slotEnd && en > slotStart && isSameDay(s, day);
    });
    return { blocks, classes };
  };

  const handleSlotClick = (day: Date, hour: number) => {
    if (createMutation.isPending || deleteMutation.isPending) return;
    const { blocks, classes } = getEventsForSlot(day, hour);
    if (classes.length > 0) return;
    if (blocks.length > 0) {
      setDeleteTarget(blocks[0]);
    } else {
      const start = setMinutes(setHours(day, hour), 0);
      const end = addHours(start, 1);
      createMutation.mutate({ start, end });
    }
  };

  const isMutating = createMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Weekly Availability</h2>
          <p className="text-sm text-muted-foreground">Click empty slots to block them. Click blocked slots to unblock.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} data-testid="button-prev-week-avail">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} data-testid="button-next-week-avail">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px]" data-testid="text-week-range-avail">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())} data-testid="button-today-avail">
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-avail">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-background border" />
          <span className="text-muted-foreground">Available (click to block)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-destructive/20 border border-destructive/40" />
          <span className="text-muted-foreground">Blocked (click to unblock)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-primary/25 border border-primary/40" />
          <span className="text-muted-foreground">Class scheduled</span>
        </div>
      </div>

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex items-center gap-3 p-4 border border-destructive/30 rounded-lg bg-destructive/5 text-sm text-destructive">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Could not load calendar: {(error as Error).message}. Make sure Google Calendar is connected and your calendar ID is set.</span>
        </div>
      )}

      {/* Mutating indicator */}
      {isMutating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoadingSpinner size="sm" />
          <span>Syncing to Google Calendar…</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header row */}
              <div className="grid grid-cols-8 border-b">
                <div className="p-3 text-center text-xs font-medium text-muted-foreground border-r">Time</div>
                {daysOfWeek.map(day => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div key={day.toISOString()} className={`p-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/10" : ""}`}>
                      <div className="text-xs font-medium uppercase text-muted-foreground">{format(day, "EEE")}</div>
                      <div className={`text-base font-semibold ${isToday ? "text-primary" : ""}`}>{format(day, "d")}</div>
                    </div>
                  );
                })}
              </div>

              {/* Time slots */}
              {timeSlots.map(hour => (
                <div key={hour} className="grid grid-cols-8 border-b last:border-b-0">
                  <div className="p-2 text-center text-xs text-muted-foreground border-r flex items-center justify-center">
                    {format(setHours(new Date(), hour), "ha")}
                  </div>
                  {daysOfWeek.map(day => {
                    const { blocks, classes } = getEventsForSlot(day, hour);
                    const hasBlock = blocks.length > 0;
                    const hasClass = classes.length > 0;
                    const isPast = setHours(day, hour + 1) < new Date();

                    return (
                      <button
                        key={`${day.toISOString()}-${hour}`}
                        onClick={() => !isPast && !hasClass && handleSlotClick(day, hour)}
                        disabled={isPast || hasClass || isMutating}
                        className={[
                          "p-2 border-r last:border-r-0 min-h-[44px] transition-colors relative text-left",
                          hasClass
                            ? "bg-primary/15 cursor-not-allowed"
                            : hasBlock
                              ? "bg-destructive/15 hover:bg-destructive/25 cursor-pointer"
                              : isPast
                                ? "opacity-40 cursor-not-allowed"
                                : "hover:bg-muted/60 cursor-pointer",
                        ].join(" ")}
                        data-testid={`slot-${format(day, "yyyy-MM-dd")}-${hour}`}
                      >
                        {hasClass && (
                          <div className="flex items-center justify-center gap-1">
                            <Lock className="h-3 w-3 text-primary" />
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
            <AlertDialogTitle>Unblock this time slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the block and make you available for classes. The change syncs to your Google Calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Keep blocked</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-unblock"
            >
              {deleteMutation.isPending ? <LoadingSpinner size="sm" /> : "Unblock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
