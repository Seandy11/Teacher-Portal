import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "./theme-toggle";
import { RoleBadge } from "./role-badge";
import { LogOut, KeyRound, X, Eye } from "lucide-react";
import logoImage from "@assets/bright-horizon-logo.png";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
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
  const { toast } = useToast();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await apiRequest("POST", "/api/change-password", {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      toast({ title: "Success", description: "Password changed successfully" });
      setPasswordDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to change password", variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

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
              <img src={logoImage} alt="Bright Horizon" className="h-7 object-contain" data-testid="img-header-logo" />
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
              <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} className="gap-2" data-testid="button-change-password">
                <KeyRound className="h-4 w-4" />
                Change Password
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

    <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
      setPasswordDialogOpen(open);
      if (!open) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              data-testid="input-current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm New Password</Label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              data-testid="input-confirm-new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPasswordDialogOpen(false)} data-testid="button-cancel-password">
            Cancel
          </Button>
          <Button onClick={handleChangePassword} disabled={isChangingPassword} data-testid="button-submit-password">
            {isChangingPassword ? "Changing..." : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
