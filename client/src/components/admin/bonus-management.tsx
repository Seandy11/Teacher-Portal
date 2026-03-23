import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Trash2, Wallet, Gift, Settings2, Check, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Teacher, Bonus } from "@shared/schema";
import { BONUS_CATEGORIES, type BonusCategory } from "@shared/schema";

const CATEGORY_LABELS: Record<BonusCategory, string> = {
  assessment: "Assessment",
  training: "Training",
  referral: "Referral",
  retention: "Retention",
  demo: "Demo",
};

const DEFAULT_RATES: Record<BonusCategory, number> = {
  assessment: 150,
  training: 150,
  referral: 150,
  retention: 150,
  demo: 150,
};

const RATES_SETTING_KEY = "bonus-rates";

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear - i);
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthStr(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseRates(raw: string | null): Record<BonusCategory, number> {
  if (!raw) return { ...DEFAULT_RATES };
  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      BONUS_CATEGORIES.map(c => [c, typeof parsed[c] === "number" ? parsed[c] : DEFAULT_RATES[c]])
    ) as Record<BonusCategory, number>;
  } catch {
    return { ...DEFAULT_RATES };
  }
}

interface BonusManagementProps {
  teachers: Teacher[];
}

export function BonusManagement({ teachers }: BonusManagementProps) {
  const { toast } = useToast();
  const activeTeachers = teachers.filter(t => t.isActive);

  // ---- Month / Year selection ----
  const now = new Date();
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const selectedMonthStr = monthStr(selectedYear, selectedMonth);

  // ---- Rates setting (single JSON blob) ----
  const { data: ratesData, isLoading: ratesLoading } = useQuery<{ key: string; value: string | null }>({
    queryKey: ["/api/admin/settings", RATES_SETTING_KEY],
    queryFn: async () => {
      const r = await fetch(`/api/admin/settings/${RATES_SETTING_KEY}`);
      if (!r.ok) return { key: RATES_SETTING_KEY, value: null };
      return r.json();
    },
  });

  const rates = parseRates(ratesData?.value ?? null);

  // ---- Rate editing ----
  const [editingRates, setEditingRates] = useState(false);
  const [rateInputs, setRateInputs] = useState<Record<BonusCategory, string>>(
    () => Object.fromEntries(BONUS_CATEGORIES.map(c => [c, ""])) as Record<BonusCategory, string>
  );

  const saveRatesMutation = useMutation({
    mutationFn: async () => {
      const newRates = Object.fromEntries(
        BONUS_CATEGORIES.map(c => [c, parseInt(rateInputs[c], 10)])
      );
      await apiRequest("PUT", `/api/admin/settings/${RATES_SETTING_KEY}`, { value: JSON.stringify(newRates) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings", RATES_SETTING_KEY] });
      toast({ title: "Rates updated" });
      setEditingRates(false);
    },
    onError: () => toast({ title: "Failed to update rates", variant: "destructive" }),
  });

  const handleEditRates = () => {
    setRateInputs(Object.fromEntries(BONUS_CATEGORIES.map(c => [c, String(rates[c])])) as Record<BonusCategory, string>);
    setEditingRates(true);
  };

  const handleSaveRates = () => {
    const invalid = BONUS_CATEGORIES.some(c => {
      const v = parseInt(rateInputs[c], 10);
      return !v || v <= 0;
    });
    if (invalid) {
      toast({ title: "All rates must be positive numbers", variant: "destructive" });
      return;
    }
    saveRatesMutation.mutate();
  };

  // ---- Per-category student counts ----
  const [studentCounts, setStudentCounts] = useState<Record<BonusCategory, string>>(
    () => Object.fromEntries(BONUS_CATEGORIES.map(c => [c, ""])) as Record<BonusCategory, string>
  );

  const setCount = (cat: BonusCategory, value: string) =>
    setStudentCounts(prev => ({ ...prev, [cat]: value }));

  const getAmount = (cat: BonusCategory) => {
    const n = parseInt(studentCounts[cat], 10);
    return n > 0 ? n * rates[cat] : 0;
  };

  const totalToAdd = BONUS_CATEGORIES.reduce((s, c) => s + getAmount(c), 0);

  // ---- Existing bonuses ----
  const { data: existingBonuses = [], isLoading: bonusesLoading } = useQuery<Bonus[]>({
    queryKey: ["/api/admin/bonuses", selectedTeacher, selectedMonthStr],
    queryFn: async () => {
      if (!selectedTeacher) return [];
      const r = await fetch(`/api/admin/bonuses/${selectedTeacher}?month=${selectedMonthStr}`);
      if (!r.ok) throw new Error("Failed to fetch bonuses");
      return r.json();
    },
    enabled: !!selectedTeacher,
  });

  // ---- Save bonuses ----
  const saveMutation = useMutation({
    mutationFn: async (entries: { category: BonusCategory; amount: number; students: number }[]) => {
      await Promise.all(
        entries.map(e =>
          apiRequest("POST", "/api/admin/bonuses", {
            teacherId: selectedTeacher,
            amount: String(e.amount),
            reason: `${CATEGORY_LABELS[e.category]} (${e.students} student${e.students !== 1 ? "s" : ""})`,
            category: e.category,
            month: selectedMonthStr,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
      toast({ title: "Bonuses saved" });
      setStudentCounts(Object.fromEntries(BONUS_CATEGORIES.map(c => [c, ""])) as Record<BonusCategory, string>);
    },
    onError: () => toast({ title: "Failed to save bonuses", variant: "destructive" }),
  });

  const handleSave = () => {
    const entries = BONUS_CATEGORIES
      .map(cat => ({ category: cat, amount: getAmount(cat), students: parseInt(studentCounts[cat], 10) || 0 }))
      .filter(e => e.amount > 0);
    if (entries.length === 0) {
      toast({ title: "Enter at least one student count", variant: "destructive" });
      return;
    }
    saveMutation.mutate(entries);
  };

  // ---- Delete bonus ----
  const [deleteTarget, setDeleteTarget] = useState<Bonus | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/bonuses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
      toast({ title: "Bonus deleted" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Failed to delete bonus", variant: "destructive" }),
  });

  const existingTotal = existingBonuses.reduce((s, b) => s + parseFloat(b.amount), 0);

  return (
    <div className="space-y-6">
      {/* ---- Per-category rates ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            Bonus Rate per Student (Rand)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ratesLoading ? (
            <LoadingSpinner size="sm" />
          ) : editingRates ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {BONUS_CATEGORIES.map(cat => (
                  <div key={cat}>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">{CATEGORY_LABELS[cat]}</label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm">R</span>
                      <Input
                        type="number"
                        min="1"
                        value={rateInputs[cat]}
                        onChange={e => setRateInputs(prev => ({ ...prev, [cat]: e.target.value }))}
                        className="w-full"
                        data-testid={`input-rate-${cat}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSaveRates} disabled={saveRatesMutation.isPending} data-testid="button-save-rates">
                  {saveRatesMutation.isPending ? <LoadingSpinner size="sm" /> : <><Check className="h-3.5 w-3.5 mr-1" />Save rates</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingRates(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {BONUS_CATEGORIES.map(cat => (
                <div key={cat} className="text-sm">
                  <span className="text-muted-foreground">{CATEGORY_LABELS[cat]}:</span>{" "}
                  <span className="font-semibold">R{rates[cat]}</span>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={handleEditRates} className="gap-1.5 ml-auto" data-testid="button-edit-rates">
                <Pencil className="h-3.5 w-3.5" />Edit rates
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Teacher + Month/Year + entry form ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Bonuses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Teacher</label>
              <Select
                value={selectedTeacher}
                onValueChange={v => {
                  setSelectedTeacher(v);
                  setStudentCounts(Object.fromEntries(BONUS_CATEGORIES.map(c => [c, ""])) as Record<BonusCategory, string>);
                }}
              >
                <SelectTrigger data-testid="select-bonus-teacher">
                  <SelectValue placeholder="Select a teacher" />
                </SelectTrigger>
                <SelectContent>
                  {activeTeachers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:w-36">
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                <SelectTrigger data-testid="select-bonus-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:w-28">
              <label className="text-sm font-medium mb-2 block">Year</label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                <SelectTrigger data-testid="select-bonus-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category rows — only show when teacher is selected */}
          {selectedTeacher && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter the number of students per bonus type. Amounts are calculated using the rates above.
              </p>
              <div className="border rounded-lg divide-y">
                {BONUS_CATEGORIES.map(cat => {
                  const amount = getAmount(cat);
                  return (
                    <div key={cat} className="flex items-center gap-4 px-4 py-3">
                      <span className="text-sm font-medium w-24 shrink-0">{CATEGORY_LABELS[cat]}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="number"
                          min="0"
                          value={studentCounts[cat]}
                          onChange={e => setCount(cat, e.target.value)}
                          placeholder="0"
                          className="w-24"
                          data-testid={`input-students-${cat}`}
                        />
                        <span className="text-xs text-muted-foreground">students</span>
                      </div>
                      <div className="text-sm font-medium w-28 text-right">
                        {amount > 0 ? (
                          <Badge variant="secondary">R{amount.toLocaleString()}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">R{rates[cat]} × 0</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Total to add:{" "}
                  <span className="font-semibold text-foreground">R{totalToAdd.toLocaleString()}</span>
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || totalToAdd === 0}
                  data-testid="button-save-bonuses"
                >
                  {saveMutation.isPending ? <LoadingSpinner size="sm" /> : "Save Bonuses"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Existing bonuses list for selected teacher + month ---- */}
      {selectedTeacher && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{MONTH_NAMES[selectedMonth - 1]} {selectedYear} — Saved Bonuses</span>
              {existingTotal > 0 && (
                <Badge variant="secondary">Total: R{existingTotal.toLocaleString()}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bonusesLoading ? (
              <div className="flex items-center justify-center py-6"><LoadingSpinner /></div>
            ) : existingBonuses.length === 0 ? (
              <EmptyState
                icon={Gift}
                title="No Bonuses"
                description="No bonuses saved for this teacher and month."
              />
            ) : (
              <div className="space-y-2">
                {existingBonuses.map(bonus => (
                  <div
                    key={bonus.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`bonus-item-${bonus.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 shrink-0">
                        <Wallet className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">R{parseFloat(bonus.amount).toLocaleString()}</p>
                          {bonus.category && (
                            <Badge variant="outline" className="text-xs capitalize">{bonus.category}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{bonus.reason}</p>
                        {bonus.createdAt && (
                          <p className="text-xs text-muted-foreground">
                            Added {format(new Date(bonus.createdAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(bonus)}
                      className="text-destructive shrink-0"
                      data-testid={`button-delete-bonus-${bonus.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Delete confirm ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bonus?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the R{deleteTarget ? parseFloat(deleteTarget.amount).toFixed(2) : ""}{" "}
              {deleteTarget?.category ? `(${deleteTarget.category}) ` : ""}bonus. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive"
              data-testid="button-confirm-delete-bonus"
            >
              {deleteMutation.isPending ? <LoadingSpinner size="sm" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
