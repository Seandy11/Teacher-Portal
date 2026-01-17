import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimetableView } from "@/components/teacher/timetable-view";
import { AttendanceTracker } from "@/components/teacher/attendance-tracker";
import { AvailabilityManager } from "@/components/teacher/availability-manager";
import { LeaveForm } from "@/components/teacher/leave-form";
import { FullPageLoader } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Calendar, FileSpreadsheet, Clock, CalendarDays } from "lucide-react";
import type { Teacher, CalendarEvent, AttendanceRow, LeaveRequest } from "@shared/schema";

export default function TeacherDashboard() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timetable");

  const { data: teacher, isLoading: teacherLoading, error: teacherError } = useQuery<Teacher>({
    queryKey: ["/api/teachers/me"],
    enabled: !!user,
  });

  const { data: events = [], isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events"],
    enabled: !!teacher,
  });

  const { data: attendance = [], isLoading: attendanceLoading, error: attendanceError, refetch: refetchAttendance } = useQuery<AttendanceRow[]>({
    queryKey: ["/api/attendance"],
    enabled: !!teacher,
  });

  const { data: leaveRequests = [], isLoading: leaveLoading, error: leaveError, refetch: refetchLeave } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests/me"],
    enabled: !!teacher,
  });

  // Handle unauthorized errors
  useEffect(() => {
    const errors = [teacherError, eventsError, attendanceError, leaveError].filter(Boolean);
    for (const error of errors) {
      if (error && isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        break;
      }
    }
  }, [teacherError, eventsError, attendanceError, leaveError, toast]);

  const createBlockMutation = useMutation({
    mutationFn: async ({ start, end }: { start: Date; end: Date }) => {
      return apiRequest("POST", "/api/calendar/availability", { start: start.toISOString(), end: end.toISOString() });
    },
    onSuccess: () => {
      toast({ title: "Availability blocked", description: "Time slot has been blocked in your calendar." });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to block time slot.", variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("DELETE", `/api/calendar/availability/${eventId}`);
    },
    onSuccess: () => {
      toast({ title: "Block removed", description: "Time slot is now available." });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to remove block.", variant: "destructive" });
    },
  });

  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ rowIndex, field, value }: { rowIndex: number; field: string; value: string }) => {
      return apiRequest("PATCH", `/api/attendance/${rowIndex}`, { field, value });
    },
    onSuccess: () => {
      toast({ title: "Attendance updated", description: "Changes saved to Google Sheets." });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update attendance.", variant: "destructive" });
    },
  });

  const createLeaveMutation = useMutation({
    mutationFn: async (data: { startDate: string; endDate: string; leaveType: string; reason?: string }) => {
      return apiRequest("POST", "/api/leave-requests", data);
    },
    onSuccess: () => {
      toast({ title: "Leave request submitted", description: "Your request has been sent for approval." });
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests/me"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to submit leave request.", variant: "destructive" });
    },
  });

  if (authLoading || teacherLoading) {
    return <FullPageLoader />;
  }

  const tabs = [
    { id: "timetable", label: "My Timetable", icon: Calendar },
    { id: "attendance", label: "Attendance", icon: FileSpreadsheet },
    { id: "availability", label: "Availability", icon: Clock },
    { id: "leave", label: "Leave", icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} teacher={teacher || null} onLogout={logout} />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex" data-testid="tabs-teacher-nav">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2" data-testid={`tab-${tab.id}`}>
                <tab.icon className="h-4 w-4 hidden sm:block" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="timetable" className="space-y-6">
            {eventsError && !isUnauthorizedError(eventsError as Error) ? (
              <ErrorDisplay 
                title="Failed to load timetable"
                message="Could not fetch your calendar events. Please check your calendar settings or try again."
                onRetry={() => refetchEvents()}
              />
            ) : (
              <TimetableView
                events={events}
                isLoading={eventsLoading}
                onRefresh={() => refetchEvents()}
              />
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-6">
            {attendanceError && !isUnauthorizedError(attendanceError as Error) ? (
              <ErrorDisplay 
                title="Failed to load attendance"
                message="Could not fetch attendance data. Please check your sheet settings or try again."
                onRetry={() => refetchAttendance()}
              />
            ) : (
              <AttendanceTracker
                rows={attendance}
                isLoading={attendanceLoading}
                onUpdate={async (rowIndex, field, value) => {
                  await updateAttendanceMutation.mutateAsync({ rowIndex, field, value });
                }}
                onRefresh={() => refetchAttendance()}
              />
            )}
          </TabsContent>

          <TabsContent value="availability" className="space-y-6">
            {eventsError && !isUnauthorizedError(eventsError as Error) ? (
              <ErrorDisplay 
                title="Failed to load availability"
                message="Could not fetch your calendar data. Please check your calendar settings or try again."
                onRetry={() => refetchEvents()}
              />
            ) : (
              <AvailabilityManager
                events={events}
                isLoading={eventsLoading}
                onCreateBlock={async (start, end) => {
                  await createBlockMutation.mutateAsync({ start, end });
                }}
                onDeleteBlock={async (eventId) => {
                  await deleteBlockMutation.mutateAsync(eventId);
                }}
                onRefresh={() => refetchEvents()}
              />
            )}
          </TabsContent>

          <TabsContent value="leave" className="space-y-6">
            {leaveError && !isUnauthorizedError(leaveError as Error) ? (
              <ErrorDisplay 
                title="Failed to load leave requests"
                message="Could not fetch your leave history. Please try again."
                onRetry={() => refetchLeave()}
              />
            ) : (
              <LeaveForm
                requests={leaveRequests}
                isLoading={leaveLoading}
                onSubmit={async (data) => {
                  await createLeaveMutation.mutateAsync(data);
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
