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

function AuthenticatedApp() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const { data: teacher, isLoading: teacherLoading } = useQuery<Teacher>({
    queryKey: ["/api/teachers/me"],
    enabled: isAuthenticated,
  });

  if (authLoading || (isAuthenticated && teacherLoading)) {
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
          <a href="/api/logout" className="text-primary hover:underline">
            Sign out
          </a>
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
          <a href="/api/logout" className="text-primary hover:underline">
            Sign out
          </a>
        </div>
      </div>
    );
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
