import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TeacherManagement } from "@/components/admin/teacher-management";
import { LeaveManagement } from "@/components/admin/leave-management";
import { FullPageLoader } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Users, FileText, LayoutDashboard, UserCheck, Clock, CheckCircle } from "lucide-react";
import type { Teacher, LeaveRequest } from "@shared/schema";

type AdminView = "dashboard" | "teachers" | "leave";

const navItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "teachers" as const, label: "Teachers", icon: Users },
  { id: "leave" as const, label: "Leave Requests", icon: FileText },
];

export default function AdminDashboard() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<AdminView>("dashboard");

  const { data: teacher } = useQuery<Teacher>({
    queryKey: ["/api/teachers/me"],
    enabled: !!user,
  });

  const { data: teachers = [], isLoading: teachersLoading, error: teachersError, refetch: refetchTeachers } = useQuery<Teacher[]>({
    queryKey: ["/api/admin/teachers"],
    enabled: !!user,
  });

  const { data: allLeaveRequests = [], isLoading: leaveLoading, error: leaveError, refetch: refetchLeave } = useQuery<(LeaveRequest & { teacher?: Teacher })[]>({
    queryKey: ["/api/admin/leave-requests"],
    enabled: !!user,
  });

  // Handle unauthorized errors
  useEffect(() => {
    const errors = [teachersError, leaveError].filter(Boolean);
    for (const error of errors) {
      if (error && isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        break;
      }
    }
  }, [teachersError, leaveError, toast]);

  const addTeacherMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/teachers", data);
    },
    onSuccess: () => {
      toast({ title: "Teacher added", description: "The teacher account has been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to add teacher.", variant: "destructive" });
    },
  });

  const updateTeacherMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/admin/teachers/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Teacher updated", description: "Changes have been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update teacher.", variant: "destructive" });
    },
  });

  const toggleTeacherMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/teachers/${id}`, { isActive });
    },
    onSuccess: () => {
      toast({ title: "Status updated", description: "Teacher access has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const updateLeaveStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/leave-requests/${id}`, { status, adminNotes: notes });
    },
    onSuccess: () => {
      toast({ title: "Leave request updated", description: "The status has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leave-requests"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({ title: "Session expired", description: "Redirecting to login...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to update leave request.", variant: "destructive" });
    },
  });

  if (authLoading) {
    return <FullPageLoader />;
  }

  const activeTeachers = teachers.filter(t => t.isActive).length;
  const pendingLeave = allLeaveRequests.filter(r => r.status === "pending").length;
  const approvedLeave = allLeaveRequests.filter(r => r.status === "approved").length;

  const stats = [
    { label: "Total Teachers", value: teachers.length, icon: Users, color: "text-blue-600" },
    { label: "Active Teachers", value: activeTeachers, icon: UserCheck, color: "text-green-600" },
    { label: "Pending Leave", value: pendingLeave, icon: Clock, color: "text-yellow-600" },
    { label: "Approved Leave", value: approvedLeave, icon: CheckCircle, color: "text-emerald-600" },
  ];

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  const hasError = (teachersError || leaveError) && !isUnauthorizedError((teachersError || leaveError) as Error);

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Admin Portal</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => setActiveView(item.id)}
                        isActive={activeView === item.id}
                        data-testid={`nav-${item.id}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1">
          <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <Header user={user} teacher={teacher || null} onLogout={logout} />
          </header>

          <main className="flex-1 p-6">
            {activeView === "dashboard" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-medium">Admin Dashboard</h1>
                  <p className="text-muted-foreground">Overview of your teacher portal</p>
                </div>

                {hasError ? (
                  <ErrorDisplay 
                    title="Failed to load dashboard data"
                    message="Could not fetch teacher or leave data. Please try again."
                    onRetry={() => {
                      refetchTeachers();
                      refetchLeave();
                    }}
                  />
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      {stats.map((stat) => (
                        <Card key={stat.label} className="hover-elevate" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {stat.label}
                            </CardTitle>
                            <stat.icon className={`h-5 w-5 ${stat.color}`} />
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold">{stat.value}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Recent Leave Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {allLeaveRequests.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No leave requests yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {allLeaveRequests.slice(0, 5).map((request) => (
                                <div key={request.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                  <div>
                                    <p className="font-medium text-sm">{request.teacher?.name}</p>
                                    <p className="text-xs text-muted-foreground">{request.startDate} — {request.endDate}</p>
                                  </div>
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    request.status === "pending" 
                                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                      : request.status === "approved"
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                  }`}>
                                    {request.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Teacher Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {teachers.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No teachers added yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {teachers.slice(0, 5).map((t) => (
                                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                  <div>
                                    <p className="font-medium text-sm">{t.name}</p>
                                    <p className="text-xs text-muted-foreground">{t.email}</p>
                                  </div>
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    t.isActive 
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                                  }`}>
                                    {t.isActive ? "Active" : "Inactive"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeView === "teachers" && (
              teachersError && !isUnauthorizedError(teachersError as Error) ? (
                <ErrorDisplay 
                  title="Failed to load teachers"
                  message="Could not fetch teacher list. Please try again."
                  onRetry={() => refetchTeachers()}
                />
              ) : (
                <TeacherManagement
                  teachers={teachers}
                  isLoading={teachersLoading}
                  onAdd={async (data) => {
                    await addTeacherMutation.mutateAsync(data);
                  }}
                  onUpdate={async (id, data) => {
                    await updateTeacherMutation.mutateAsync({ id, data });
                  }}
                  onToggleActive={async (id, isActive) => {
                    await toggleTeacherMutation.mutateAsync({ id, isActive });
                  }}
                />
              )
            )}

            {activeView === "leave" && (
              leaveError && !isUnauthorizedError(leaveError as Error) ? (
                <ErrorDisplay 
                  title="Failed to load leave requests"
                  message="Could not fetch leave data. Please try again."
                  onRetry={() => refetchLeave()}
                />
              ) : (
                <LeaveManagement
                  requests={allLeaveRequests}
                  isLoading={leaveLoading}
                  onUpdateStatus={async (id, status, notes) => {
                    await updateLeaveStatusMutation.mutateAsync({ id, status, notes });
                  }}
                />
              )
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
