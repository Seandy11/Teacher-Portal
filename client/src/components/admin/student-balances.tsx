import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, AlertTriangle, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface StudentBalance {
  studentName: string;
  teacherName: string;
  remainingTime: string;
  timePurchased: string;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || timeStr === "N/A") return Infinity;
  const isNegative = /^\s*[-(]/.test(timeStr);
  const cleaned = timeStr.replace(/[^0-9:.]/g, "");
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    const hours = parseInt(parts[0] || "0", 10);
    const minutes = parseInt(parts[1] || "0", 10);
    const total = hours * 60 + minutes;
    return isNegative ? -total : total;
  }
  const num = parseFloat(cleaned);
  if (isNaN(num)) return Infinity;
  return isNegative ? -num : num;
}

function getWarningLevel(remainingTime: string): "danger" | "warning" | "ok" {
  const minutes = parseTimeToMinutes(remainingTime);
  if (minutes <= 0) return "danger";
  if (minutes <= 120) return "warning";
  return "ok";
}

export function StudentBalances() {
  const { toast } = useToast();
  const { data: balances, isLoading, error, isFetching, refetch } = useQuery<StudentBalance[]>({
    queryKey: ["/api/admin/student-balances"],
    retry: false,
  });

  const handleRefresh = () => {
    refetch();
    toast({ title: "Refreshing", description: "Fetching latest data from Google Sheets..." });
  };

  const isGoogleError = error && (error as any)?.message?.includes("Google");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium" data-testid="text-student-balances-title">Student Balances</h1>
          <p className="text-muted-foreground">Overview of remaining lesson time across all students</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isFetching}
          variant="outline"
          data-testid="button-refresh-balances"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isGoogleError ? (
        <Card data-testid="card-google-not-connected">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Google Not Connected</h3>
            <p className="text-muted-foreground max-w-md">
              Google Sheets access is required to view student balances. Please connect your Google account from the Dashboard settings.
            </p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-medium mb-2">Failed to Load</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Could not fetch student balance data. Please try again.
            </p>
            <Button onClick={handleRefresh} variant="outline" data-testid="button-retry-balances">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Loading student data...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : balances && balances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Students Found</h3>
            <p className="text-muted-foreground max-w-md">
              No active teachers have Google Sheets configured, or no student tabs were found.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {balances?.length} Student{balances?.length !== 1 ? "s" : ""}
              </CardTitle>
              {isFetching && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Updating...
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="header-student">Student</TableHead>
                    <TableHead data-testid="header-teacher">Teacher</TableHead>
                    <TableHead data-testid="header-remaining">Remaining Time</TableHead>
                    <TableHead data-testid="header-purchased">Time Purchased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances?.map((balance, index) => {
                    const level = getWarningLevel(balance.remainingTime);
                    return (
                      <TableRow
                        key={`${balance.teacherName}-${balance.studentName}`}
                        className={
                          level === "danger"
                            ? "bg-red-50 dark:bg-red-950/30"
                            : level === "warning"
                              ? "bg-orange-50 dark:bg-orange-950/20"
                              : ""
                        }
                        data-testid={`row-student-${index}`}
                      >
                        <TableCell className="font-medium" data-testid={`text-student-name-${index}`}>
                          {balance.studentName}
                        </TableCell>
                        <TableCell data-testid={`text-teacher-name-${index}`}>
                          {balance.teacherName}
                        </TableCell>
                        <TableCell data-testid={`text-remaining-time-${index}`}>
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              level === "danger"
                                ? "text-red-600 dark:text-red-400"
                                : level === "warning"
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-foreground"
                            }`}
                          >
                            {level !== "ok" && <AlertTriangle className="h-3.5 w-3.5" />}
                            {balance.remainingTime}
                          </span>
                        </TableCell>
                        <TableCell data-testid={`text-time-purchased-${index}`}>
                          {balance.timePurchased}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
