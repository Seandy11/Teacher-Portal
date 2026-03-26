import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ArcStudent {
  studentName: string;
  teacherName: string;
  totalLessons: number;
  trialLessons: number;
  normalLessons: number;
  trialAmount: number;
  normalAmount: number;
  totalAmount: number;
}

interface ArcBillingResponse {
  students: ArcStudent[];
  rates: { normal: number; trial: number };
  month: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ArcBilling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [editNormalRate, setEditNormalRate] = useState<string>("");
  const [editTrialRate, setEditTrialRate] = useState<string>("");
  const [ratesInitialized, setRatesInitialized] = useState(false);

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);

  const { data, isLoading, isFetching } = useQuery<ArcBillingResponse>({
    queryKey: ["/api/admin/arc-billing", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/admin/arc-billing?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ARC billing");
      return res.json();
    },
    retry: false,
  });

  if (data && !ratesInitialized) {
    setEditNormalRate(String(data.rates.normal));
    setEditTrialRate(String(data.rates.trial));
    setRatesInitialized(true);
  }

  const saveRatesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/admin/arc-rates", {
        normalRate: parseFloat(editNormalRate) || 0,
        trialRate: parseFloat(editTrialRate) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/arc-billing"] });
      toast({ title: "Rates saved", description: "ARC rates updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save rates.", variant: "destructive" });
    },
  });

  const navigateMonth = (direction: number) => {
    let newMonth = selMonthNum + direction;
    let newYear = selYear;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setSelectedMonth(`${newYear}-${String(newMonth).padStart(2, "0")}`);
  };

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i);

  const grandTotal = data?.students.reduce((sum, s) => sum + s.totalAmount, 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium" data-testid="text-arc-billing-title">ARC Billing</h1>
        <p className="text-muted-foreground">Track ARC student lessons and calculate billing per month</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">ARC Rates (Rand)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="trial-rate">Trial Rate (first 3 classes)</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">R</span>
                <Input
                  id="trial-rate"
                  type="number"
                  step="0.01"
                  value={editTrialRate}
                  onChange={(e) => setEditTrialRate(e.target.value)}
                  className="w-28"
                  data-testid="input-trial-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normal-rate">Normal Rate</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">R</span>
                <Input
                  id="normal-rate"
                  type="number"
                  step="0.01"
                  value={editNormalRate}
                  onChange={(e) => setEditNormalRate(e.target.value)}
                  className="w-28"
                  data-testid="input-normal-rate"
                />
              </div>
            </div>
            <Button
              onClick={() => saveRatesMutation.mutate()}
              disabled={saveRatesMutation.isPending}
              size="sm"
              data-testid="button-save-arc-rates"
            >
              <Save className="h-4 w-4 mr-1" />
              Save Rates
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Monthly Lessons</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex gap-2">
                <Select
                  value={String(selMonthNum)}
                  onValueChange={(v) => setSelectedMonth(`${selYear}-${v.padStart(2, "0")}`)}
                >
                  <SelectTrigger className="w-32" data-testid="select-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(selYear)}
                  onValueChange={(v) => setSelectedMonth(`${v}-${String(selMonthNum).padStart(2, "0")}`)}
                >
                  <SelectTrigger className="w-24" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} data-testid="button-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : !data?.students.length ? (
            <p className="text-muted-foreground text-center py-8">No ARC lessons found for {MONTHS[selMonthNum - 1]} {selYear}</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-center">Trial</TableHead>
                    <TableHead className="text-center">Normal</TableHead>
                    <TableHead className="text-center">Total Lessons</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((student, idx) => (
                    <TableRow key={student.studentName} data-testid={`row-arc-student-${idx}`}>
                      <TableCell className="font-medium" data-testid={`text-arc-student-${idx}`}>
                        {student.studentName}
                      </TableCell>
                      <TableCell>{student.teacherName}</TableCell>
                      <TableCell className="text-center">
                        {student.trialLessons > 0 && (
                          <span className="text-blue-600 dark:text-blue-400">
                            {student.trialLessons} × R{data.rates.trial}
                          </span>
                        )}
                        {student.trialLessons === 0 && "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {student.normalLessons > 0 && (
                          <span>
                            {student.normalLessons} × R{data.rates.normal}
                          </span>
                        )}
                        {student.normalLessons === 0 && "—"}
                      </TableCell>
                      <TableCell className="text-center font-medium">{student.totalLessons}</TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-arc-amount-${idx}`}>
                        R{student.totalAmount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-right">Total</TableCell>
                    <TableCell className="text-right" data-testid="text-arc-grand-total">
                      R{grandTotal.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
