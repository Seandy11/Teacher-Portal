import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimetableView } from "@/components/teacher/timetable-view";
import { AttendanceTracker } from "@/components/teacher/attendance-tracker";
import { AvailabilityManager } from "@/components/teacher/availability-manager";
import { LeaveForm } from "@/components/teacher/leave-form";
import { PayDashboard } from "@/components/teacher/pay-dashboard";
import { FullPageLoader } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Calendar, FileSpreadsheet, CalendarDays, Wallet, CalendarClock } from "lucide-react";
import { startOfWeek, endOfWeek, subWeeks, addWeeks } from "date-fns";
import type { Teacher, CalendarEvent, AttendanceRow, LeaveRequest, SheetTab } from "@shared/schema";

export default function TeacherDashboard() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timetable");
  const [selectedStudentTab, setSelectedStudentTab] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const eventsTimeMin = subWeeks(startOfWeek(currentWeek, { weekStartsOn: 1 }), 1).toISOString();
  const eventsTimeMax = addWeeks(endOfWeek(currentWeek, { weekStartsOn: 1 }), 2).toISOString();

  const { data: teacher, isLoading: teacherLoading, error: teacherError } = useQuery<Teacher>({
    queryKey: ["/api/teachers/me"],
    enabled: !!user,
  });

  const { data: events = [], isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", eventsTimeMin, eventsTimeMax],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?timeMin=${encodeURIComponent(eventsTimeMin)}&timeMax=${encodeURIComponent(eventsTimeMax)}`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!teacher,
  });

  // Fetch sheet tabs (student worksheets)
  const { data: sheetTabs = [], isLoading: tabsLoading, error: tabsError, refetch: refetchTabs } = useQuery<SheetTab[]>({
    queryKey: ["/api/attendance/tabs"],
    enabled: !!teacher,
  });

  // Fetch attendance data for selected student tab
  const { data: attendance = [], isLoading: attendanceLoading, error: attendanceError, refetch: refetchAttendance } = useQuery<AttendanceRow[]>({
    queryKey: [`/api/attendance?tab=${encodeURIComponent(selectedStudentTab)}`],
    enabled: !!teacher && !!selectedStudentTab,
  });

  const { data: leaveRequests = [], isLoading: leaveLoading, error: leaveError, refetch: refetchLeave } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests/me"],
    enabled: !!teacher,
  });

  // Handle unauthorized errors
  useEffect(() => {
    const errors = [teacherError, eventsError, attendanceError, leaveError, tabsError].filter(Boolean);
    for (const error of errors) {
      if (error && isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        break;
      }
    }
  }, [teacherError, eventsError, attendanceError, leaveError, tabsError, toast]);

  const updateLessonMutation = useMutation({
    mutationFn: async ({ rowIndex, value }: { rowIndex: number; value: string }) => {
      if (!selectedStudentTab) {
        throw new Error("No student tab selected");
      }
      return apiRequest("PATCH", `/api/attendance/${rowIndex}`, { tabName: selectedStudentTab, value });
    },
    onSuccess: () => {
      toast({ title: "Lesson updated", description: "Changes saved to Google Sheets." });
      queryClient.invalidateQueries({ queryKey: [`/api/attendance?tab=${encodeURIComponent(selectedStudentTab)}`] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update lesson details.", variant: "destructive" });
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
        setTimeout(() => { window.location.href = "/"; }, 500);
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
    { id: "attendance", label: "Lesson Tracker", icon: FileSpreadsheet },
    { id: "availability", label: "Availability", icon: CalendarClock },
    { id: "pay", label: "My Pay", icon: Wallet },
    { id: "leave", label: "Leave", icon: CalendarDays },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header user={user ?? null} teacher={teacher || null} onLogout={logout} />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex" data-testid="tabs-teacher-nav">
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
                currentWeek={currentWeek}
                onWeekChange={setCurrentWeek}
              />
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-6">
            {(attendanceError || tabsError) && !isUnauthorizedError((attendanceError || tabsError) as Error) ? (
              <ErrorDisplay 
                title="Failed to load lesson tracker"
                message="Could not fetch lesson data. Please check your sheet settings or try again."
                onRetry={() => { refetchTabs(); refetchAttendance(); }}
              />
            ) : (
              <AttendanceTracker
                tabs={sheetTabs}
                rows={attendance}
                isLoadingTabs={tabsLoading}
                isLoadingRows={attendanceLoading}
                selectedTab={selectedStudentTab}
                onSelectTab={setSelectedStudentTab}
                onUpdate={async (rowIndex, value) => {
                  await updateLessonMutation.mutateAsync({ rowIndex, value });
                }}
                onRefresh={() => { refetchTabs(); refetchAttendance(); }}
              />
            )}
          </TabsContent>

          <TabsContent value="availability" className="space-y-6">
            <AvailabilityManager />
          </TabsContent>

          <TabsContent value="pay" className="space-y-6">
            <PayDashboard />
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
