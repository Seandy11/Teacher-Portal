import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: "pending" | "approved" | "rejected";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      icon: Clock,
      label: "Pending",
      className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
    },
    approved: {
      icon: CheckCircle,
      label: "Approved",
      className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
    },
    rejected: {
      icon: XCircle,
      label: "Rejected",
      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={`gap-1 ${className}`} data-testid={`badge-status-${status}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
