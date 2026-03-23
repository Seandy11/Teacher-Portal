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
import { formatMonthLocal, getCurrentMonthLocal } from "@/lib/date-utils";
import type { Teacher, Bonus } from "@shared/schema";
import { BONUS_CATEGORIES, type BonusCategory } from "@shared/schema";

const CATEGORY_LABELS: Record<BonusCategory, string> = {
  assessment: "Assessment",
  training: "Training",
  referral: "Referral",
  retention: "Retention",
  demo: "Demo",
};

const DEFAULT_INCREMENT = 150;
const DROPDOWN_STEPS = 20; // show up to 20 steps in dropdown

interface BonusManagementProps {
  teachers: Teacher[];
}

function generateMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: formatMonthLocal(date),
      label: format(date, "MMMM yyyy"),
    });
  }
  return options;
}

const monthOptions = generateMonthOptions();

function generateAmountOptions(increment: number) {
  const options: { label: string; value: string }[] = [
    { label: "R0 (none)", value: "0" },
  ];
  for (let i = 1; i <= DROPDOWN_STEPS; i++) {
    const amt = increment * i;
    options.push({ label: `R${amt}`, value: String(amt) });
  }
  options.push({ label: "Custom amount...", value: "custom" });
  return options;
}

export function BonusManagement({ teachers }: BonusManagementProps) {
  const { toast } = useToast();
  const activeTeachers = teachers.filter(t => t.isActive);

  // ---- Increment setting ----
  const [editingIncrement, setEditingIncrement] = useState(false);
  const [incrementInput, setIncrementInput] = useState("");

  const { data: incrementData, isLoading: incrementLoading } = useQuery<{ key: string; value: string | null }>({
    queryKey: ["/api/admin/settings/bonus-increment"],
    queryFn: async () => {
      const r = await fetch("/api/admin/settings/bonus-increment");
      if (!r.ok) return { key: "bonus-increment", value: null };
      return r.json();
    },
  });

  const increment = incrementData?.value ? parseInt(incrementData.value, 10) : DEFAULT_INCREMENT;
  const amountOptions = generateAmountOptions(increment);

  const saveIncrementMutation = useMutation({
    mutationFn: async (value: string) => apiRequest("PUT", "/api/admin/settings/bonus-increment", { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/bonus-increment"] });
      toast({ title: "Increment updated" });
      setEditingIncrement(false);
    },
    onError: () => toast({ title: "Failed to update increment", variant: "destructive" }),
  });

  const handleSaveIncrement = () => {
    const val = parseInt(incrementInput, 10);
    if (!val || val <= 0) {
      toast({ title: "Please enter a valid positive number", variant: "destructive" });
      return;
    }
    saveIncrementMutation.mutate(String(val));
  };

  // ---- Teacher / month selection ----
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthLocal());

  // ---- Per-category form state ----
  type CategoryState = { dropdownValue: string; customValue: string };
  const defaultCategoryState = (): Record<BonusCategory, CategoryState> =>
    Object.fromEntries(BONUS_CATEGORIES.map(c => [c, { dropdownValue: "0", customValue: "" }])) as Record<BonusCategory, CategoryState>;
  const [categoryValues, setCategoryValues] = useState<Record<BonusCategory, CategoryState>>(defaultCategoryState());

  const setCategoryField = (cat: BonusCategory, field: keyof CategoryState, value: string) => {
    setCategoryValues(prev => ({ ...prev, [cat]: { ...prev[cat], [field]: value } }));
  };

  const resolveAmount = (cat: BonusCategory): number => {
    const { dropdownValue, customValue } = categoryValues[cat];
    if (dropdownValue === "custom") return parseFloat(customValue) || 0;
    return parseFloat(dropdownValue) || 0;
  };

  // ---- Existing bonuses query ----
  const { data: existingBonuses = [], isLoading: bonusesLoading } = useQuery<Bonus[]>({
    queryKey: ["/api/admin/bonuses", selectedTeacher, selectedMonth],
    queryFn: async () => {
      if (!selectedTeacher) return [];
      const r = await fetch(`/api/admin/bonuses/${selectedTeacher}?month=${selectedMonth}`);
      if (!r.ok) throw new Error("Failed to fetch bonuses");
      return r.json();
    },
    enabled: !!selectedTeacher,
  });

  // ---- Save bonuses ----
  const saveMutation = useMutation({
    mutationFn: async (entries: { category: BonusCategory; amount: number }[]) => {
      const results = await Promise.all(
        entries.map(e =>
          apiRequest("POST", "/api/admin/bonuses", {
            teacherId: selectedTeacher,
            amount: String(e.amount),
            reason: CATEGORY_LABELS[e.category],
            category: e.category,
            month: selectedMonth,
          })
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
      toast({ title: "Bonuses saved successfully" });
      setCategoryValues(defaultCategoryState());
    },
    onError: () => toast({ title: "Failed to save bonuses", variant: "destructive" }),
  });

  const handleSave = () => {
    const entries = BONUS_CATEGORIES
      .map(cat => ({ category: cat, amount: resolveAmount(cat) }))
      .filter(e => e.amount > 0);
    if (entries.length === 0) {
      toast({ title: "No bonus amounts entered", variant: "destructive" });
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

  const totalToSave = BONUS_CATEGORIES.reduce((s, c) => s + resolveAmount(c), 0);
  const existingTotal = existingBonuses.reduce((s, b) => s + parseFloat(b.amount), 0);

  return (
    <div className="space-y-6">
      {/* ---- Increment Setting ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Settings2 className="h-4 w-4" />
            Bonus Increment Setting
          </CardTitle>
        </CardHeader>
        <CardContent>
          {incrementLoading ? (
            <LoadingSpinner size="sm" />
          ) : editingIncrement ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">R</span>
              <Input
                type="number"
                min="1"
                value={incrementInput}
                onChange={e => setIncrementInput(e.target.value)}
                className="w-28"
                placeholder={String(increment)}
                data-testid="input-increment-value"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleSaveIncrement}
                disabled={saveIncrementMutation.isPending}
                data-testid="button-save-increment"
              >
                {saveIncrementMutation.isPending ? <LoadingSpinner size="sm" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingIncrement(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm">
                Dropdowns go up in increments of <span className="font-semibold">R{increment}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setIncrementInput(String(increment)); setEditingIncrement(true); }}
                className="gap-1.5"
                data-testid="button-edit-increment"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Teacher + Month selector ---- */}
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
                onValueChange={v => { setSelectedTeacher(v); setCategoryValues(defaultCategoryState()); }}
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
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger data-testid="select-bonus-month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ---- Category dropdowns ---- */}
          {selectedTeacher && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select amounts for each bonus category. Leave at R0 to skip.</p>
              <div className="divide-y border rounded-lg">
                {BONUS_CATEGORIES.map(cat => {
                  const { dropdownValue, customValue } = categoryValues[cat];
                  const isCustom = dropdownValue === "custom";
                  return (
                    <div key={cat} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm font-medium w-24 shrink-0">{CATEGORY_LABELS[cat]}</span>
                      <Select
                        value={dropdownValue}
                        onValueChange={v => setCategoryField(cat, "dropdownValue", v)}
                      >
                        <SelectTrigger className="flex-1" data-testid={`select-bonus-${cat}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {amountOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isCustom && (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">R</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={customValue}
                            onChange={e => setCategoryField(cat, "customValue", e.target.value)}
                            className="w-28"
                            placeholder="0.00"
                            data-testid={`input-bonus-custom-${cat}`}
                          />
                        </div>
                      )}
                      {resolveAmount(cat) > 0 && (
                        <Badge variant="secondary" className="shrink-0">R{resolveAmount(cat)}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Total to add: <span className="font-semibold text-foreground">R{totalToSave.toFixed(2)}</span>
                </p>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || totalToSave === 0}
                  className="gap-2"
                  data-testid="button-save-bonuses"
                >
                  {saveMutation.isPending ? <LoadingSpinner size="sm" /> : null}
                  Save Bonuses
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Existing bonuses list ---- */}
      {selectedTeacher && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>
                Existing Bonuses — {monthOptions.find(m => m.value === selectedMonth)?.label}
              </span>
              {existingTotal > 0 && (
                <Badge variant="secondary">Total: R{existingTotal.toFixed(2)}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bonusesLoading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : existingBonuses.length === 0 ? (
              <EmptyState
                icon={Gift}
                title="No Bonuses"
                description="No bonuses added for this teacher and month yet."
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
                          <p className="font-medium">R{parseFloat(bonus.amount).toFixed(2)}</p>
                          {bonus.category && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {bonus.category}
                            </Badge>
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
              {deleteTarget?.category ? `(${deleteTarget.category}) ` : ""}bonus. This action cannot be undone.
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
