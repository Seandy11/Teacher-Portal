import { Badge } from "@/components/ui/badge";
import { Shield, GraduationCap } from "lucide-react";

interface RoleBadgeProps {
  role: "teacher" | "admin";
}

export function RoleBadge({ role }: RoleBadgeProps) {
  if (role === "admin") {
    return (
      <Badge variant="default" className="gap-1" data-testid="badge-role-admin">
        <Shield className="h-3 w-3" />
        Admin
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1" data-testid="badge-role-teacher">
      <GraduationCap className="h-3 w-3" />
      Teacher
    </Badge>
  );
}
