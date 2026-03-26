import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, ChevronLeft, ChevronRight, Settings2, X } from "lucide-react";
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
  effectiveNormalRate: number;
  effectiveTrialRate: number;
  effectiveTrialCount: number;
  hasOverride: boolean;
}

interface ArcBillingResponse {
  students: ArcStudent[];
  rates: { normal: number; trial: number };
  defaultTrialCount: number;
  currency: string;
  overrides: Record<string, { normalRate?: number; trialRate?: number; trialCount?: number }>;
  month: string;
}

const CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "ZAR", symbol: "R", label: "Rand (R)" },
  { code: "CNY", symbol: "¥", label: "RMB (¥)" },
  { code: "HKD", symbol: "HK$", label: "HKD (HK$)" },
  { code: "USD", symbol: "$", label: "USD ($)" },
  { code: "EUR", symbol: "€", label: "EUR (€)" },
  { code: "GBP", symbol: "£", label: "GBP (£)" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function getCurrencySymbol(code: string) {
  return CURRENCIES.find(c => c.code === code)?.symbol || code;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ArcBilling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [editNormalRate, setEditNormalRate] = useState("");
  const [editTrialRate, setEditTrialRate] = useState("");
  const [editTrialCount, setEditTrialCount] = useState("3");
  const [editCurrency, setEditCurrency] = useState("ZAR");
  const [settingsInitialized, setSettingsInitialized] = useState(false);

  const [overrideStudent, setOverrideStudent] = useState<string | null>(null);
  const [ovNormalRate, setOvNormalRate] = useState("");
  const [ovTrialRate, setOvTrialRate] = useState("");
  const [ovTrialCount, setOvTrialCount] = useState("");

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);

  const { data, isLoading } = useQuery<ArcBillingResponse>({
    queryKey: ["/api/admin/arc-billing", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/admin/arc-billing?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ARC billing");
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (data && !settingsInitialized) {
      setEditNormalRate(String(data.rates.normal));
      setEditTrialRate(String(data.rates.trial));
      setEditTrialCount(String(data.defaultTrialCount));
      setEditCurrency(data.currency);
      setSettingsInitialized(true);
    }
  }, [data, settingsInitialized]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/admin/arc-settings", {
        normalRate: parseFloat(editNormalRate) || 0,
        trialRate: parseFloat(editTrialRate) || 0,
        trialCount: parseInt(editTrialCount) || 3,
        currency: editCurrency,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/arc-billing"] });
      toast({ title: "Settings saved", description: "ARC billing settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const saveOverrideMutation = useMutation({
    mutationFn: async (params: { studentName: string; normalRate?: string; trialRate?: string; trialCount?: string; remove?: boolean }) => {
      await apiRequest("PATCH", "/api/admin/arc-student-override", params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/arc-billing"] });
      setOverrideStudent(null);
      toast({ title: "Override saved", description: "Student-specific rates updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save override.", variant: "destructive" });
    },
  });

  const openOverrideDialog = (studentName: string) => {
    const ov = data?.overrides[studentName];
    setOverrideStudent(studentName);
    setOvNormalRate(ov?.normalRate !== undefined ? String(ov.normalRate) : "");
    setOvTrialRate(ov?.trialRate !== undefined ? String(ov.trialRate) : "");
    setOvTrialCount(ov?.trialCount !== undefined ? String(ov.trialCount) : "");
  };

  const navigateMonth = (direction: number) => {
    let newMonth = selMonthNum + direction;
    let newYear = selYear;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setSelectedMonth(`${newYear}-${String(newMonth).padStart(2, "0")}`);
  };

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 1 + i);
  const sym = getCurrencySymbol(data?.currency || editCurrency);
  const grandTotal = data?.students.reduce((sum, s) => sum + s.totalAmount, 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium" data-testid="text-arc-billing-title">ARC Billing</h1>
        <p className="text-muted-foreground">Track ARC student lessons and calculate billing per month. DEMO lessons are excluded.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Default Rates & Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select value={editCurrency} onValueChange={setEditCurrency}>
                <SelectTrigger className="w-36" data-testid="select-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trial-rate">Trial Rate</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">{getCurrencySymbol(editCurrency)}</span>
                <Input
                  id="trial-rate"
                  type="number"
                  step="0.01"
                  value={editTrialRate}
                  onChange={(e) => setEditTrialRate(e.target.value)}
                  className="w-24"
                  data-testid="input-trial-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normal-rate">Normal Rate</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">{getCurrencySymbol(editCurrency)}</span>
                <Input
                  id="normal-rate"
                  type="number"
                  step="0.01"
                  value={editNormalRate}
                  onChange={(e) => setEditNormalRate(e.target.value)}
                  className="w-24"
                  data-testid="input-normal-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trial-count">Trial Classes</Label>
              <Input
                id="trial-count"
                type="number"
                min="0"
                value={editTrialCount}
                onChange={(e) => setEditTrialCount(e.target.value)}
                className="w-20"
                data-testid="input-trial-count"
              />
            </div>
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              size="sm"
              data-testid="button-save-arc-settings"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
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
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-center">Trial</TableHead>
                    <TableHead className="text-center">Normal</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((student, idx) => (
                    <TableRow key={student.studentName} data-testid={`row-arc-student-${idx}`}>
                      <TableCell className="font-medium" data-testid={`text-arc-student-${idx}`}>
                        <span className="flex items-center gap-1.5">
                          {student.studentName}
                          {student.hasOverride && (
                            <span className="text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">Custom</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{student.teacherName}</TableCell>
                      <TableCell className="text-center">
                        {student.trialLessons > 0 ? (
                          <span className="text-blue-600 dark:text-blue-400">
                            {student.trialLessons} × {sym}{student.effectiveTrialRate}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {student.normalLessons > 0 ? (
                          <span>
                            {student.normalLessons} × {sym}{student.effectiveNormalRate}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center font-medium">{student.totalLessons}</TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-arc-amount-${idx}`}>
                        {sym}{student.totalAmount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openOverrideDialog(student.studentName)}
                          title="Set custom rate for this student"
                          data-testid={`button-override-${idx}`}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={5} className="text-right">Total</TableCell>
                    <TableCell className="text-right" data-testid="text-arc-grand-total">
                      {sym}{grandTotal.toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!overrideStudent} onOpenChange={(open) => { if (!open) setOverrideStudent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Rates: {overrideStudent}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Leave fields empty to use the default rates. Fill in only the values you want to override.
          </p>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Trial Rate (default: {sym}{data?.rates.trial})</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">{sym}</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Use default"
                  value={ovTrialRate}
                  onChange={(e) => setOvTrialRate(e.target.value)}
                  data-testid="input-override-trial-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Normal Rate (default: {sym}{data?.rates.normal})</Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">{sym}</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Use default"
                  value={ovNormalRate}
                  onChange={(e) => setOvNormalRate(e.target.value)}
                  data-testid="input-override-normal-rate"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Trial Classes (default: {data?.defaultTrialCount})</Label>
              <Input
                type="number"
                min="0"
                placeholder="Use default"
                value={ovTrialCount}
                onChange={(e) => setOvTrialCount(e.target.value)}
                data-testid="input-override-trial-count"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            {overrideStudent && data?.overrides[overrideStudent] && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => saveOverrideMutation.mutate({ studentName: overrideStudent!, remove: true })}
                disabled={saveOverrideMutation.isPending}
                data-testid="button-remove-override"
              >
                <X className="h-4 w-4 mr-1" />
                Remove Override
              </Button>
            )}
            <Button
              onClick={() => saveOverrideMutation.mutate({
                studentName: overrideStudent!,
                normalRate: ovNormalRate || undefined,
                trialRate: ovTrialRate || undefined,
                trialCount: ovTrialCount || undefined,
              })}
              disabled={saveOverrideMutation.isPending}
              data-testid="button-save-override"
            >
              <Save className="h-4 w-4 mr-1" />
              Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
