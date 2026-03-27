import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FullPageLoader } from "@/components/loading-spinner";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/login";
import TeacherDashboard from "@/pages/teacher-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import NotFound from "@/pages/not-found";
import type { Teacher } from "@shared/schema";

interface ImpersonationStatus {
  isImpersonating: boolean;
  teacher?: Teacher | null;
}

function AuthenticatedApp() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  
  const { data: teacher, isLoading: teacherLoading } = useQuery<Teacher>({
    queryKey: ["/api/teachers/me"],
    enabled: isAuthenticated,
  });

  const { data: impersonationStatus, isLoading: impersonationLoading } = useQuery<ImpersonationStatus>({
    queryKey: ["/api/admin/impersonate/status"],
    enabled: isAuthenticated,
  });

  if (authLoading || (isAuthenticated && (teacherLoading || impersonationLoading))) {
    return <FullPageLoader />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!teacher) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-medium mb-2">Access Pending</h1>
          <p className="text-muted-foreground mb-4">
            Your account is not yet set up in the Teacher Portal. Please contact your administrator.
          </p>
          <button onClick={() => logout()} className="text-primary hover:underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!teacher.isActive) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-medium mb-2">Account Deactivated</h1>
          <p className="text-muted-foreground mb-4">
            Your account has been deactivated. Please contact your administrator if you believe this is an error.
          </p>
          <button onClick={() => logout()} className="text-primary hover:underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // If admin is impersonating a teacher, show the teacher dashboard
  if (impersonationStatus?.isImpersonating) {
    return <TeacherDashboard />;
  }

  if (teacher.role === "admin") {
    return <AdminDashboard />;
  }

  return <TeacherDashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthenticatedApp} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
