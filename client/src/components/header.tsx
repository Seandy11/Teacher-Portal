import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { RoleBadge } from "./role-badge";
import { LogOut, User, GraduationCap, X, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { User as AuthUser } from "@shared/models/auth";
import type { Teacher } from "@shared/schema";

interface HeaderProps {
  user: AuthUser | null;
  teacher: Teacher | null;
  onLogout: () => void;
}

interface ImpersonationStatus {
  isImpersonating: boolean;
  teacher?: Teacher | null;
}

export function Header({ user, teacher, onLogout }: HeaderProps) {
  const [, setLocation] = useLocation();
  
  const { data: impersonationStatus } = useQuery<ImpersonationStatus>({
    queryKey: ["/api/admin/impersonate/status"],
    staleTime: 5000,
  });

  const handleExitImpersonation = async () => {
    try {
      await apiRequest("POST", "/api/admin/impersonate/exit");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonate/status"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/teachers/me"] });
      setLocation("/");
      window.location.reload();
    } catch (error) {
      console.error("Failed to exit impersonation:", error);
    }
  };

  const displayName = impersonationStatus?.isImpersonating 
    ? impersonationStatus.teacher?.name || "Teacher"
    : teacher?.name || user?.firstName || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      {impersonationStatus?.isImpersonating && (
        <div className="sticky top-0 z-[60] w-full bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3" data-testid="banner-impersonation">
          <Eye className="h-4 w-4" />
          <span className="text-sm font-medium">
            Viewing as: {impersonationStatus.teacher?.name || "Teacher"}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 bg-white/20 border-amber-700 hover:bg-white/30 text-amber-950"
            onClick={handleExitImpersonation}
            data-testid="button-exit-impersonation"
          >
            <X className="h-3 w-3 mr-1" />
            Exit View
          </Button>
        </div>
      )}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary p-1.5">
                <GraduationCap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-medium text-lg hidden sm:inline">Teacher Portal</span>
            </div>
          </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium">{displayName}</span>
                  {teacher && (
                    <RoleBadge role={teacher.role} />
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center gap-2 p-2">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{displayName}</span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="gap-2">
                <User className="h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="gap-2 text-destructive" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
    </>
  );
}
