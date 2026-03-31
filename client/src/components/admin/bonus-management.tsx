import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Plus, Trash2, Wallet, Gift, Download } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatMonthLocal, getCurrentMonthLocal } from "@/lib/date-utils";
import type { Teacher, Bonus } from "@shared/schema";

const bonusFormSchema = z.object({
  teacherId: z.string().min(1, "Please select a teacher"),
  amount: z.string().min(1, "Amount is required"),
  reason: z.string().min(1, "Reason is required"),
  month: z.string().min(1, "Month is required"),
});

type BonusFormValues = z.infer<typeof bonusFormSchema>;

interface BonusManagementProps {
  teachers: Teacher[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  unmatched: string[];
}

export function BonusManagement({ teachers }: BonusManagementProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bonus | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthLocal());
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();

  const form = useForm<BonusFormValues>({
    resolver: zodResolver(bonusFormSchema),
    defaultValues: {
      teacherId: "",
      amount: "",
      reason: "",
      month: getCurrentMonthLocal(),
    },
  });

  const { data: bonuses = [], isLoading } = useQuery<Bonus[]>({
    queryKey: ["/api/admin/bonuses", selectedTeacher, selectedMonth],
    queryFn: async () => {
      if (!selectedTeacher) return [];
      const response = await fetch(`/api/admin/bonuses/${selectedTeacher}?month=${selectedMonth}`);
      if (!response.ok) throw new Error("Failed to fetch bonuses");
      return response.json();
    },
    enabled: !!selectedTeacher,
  });

  const createMutation = useMutation({
    mutationFn: async (data: BonusFormValues) => {
      return apiRequest("POST", "/api/admin/bonuses", {
        teacherId: data.teacherId,
        amount: data.amount,
        reason: data.reason,
        month: data.month,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
      toast({ title: "Bonus added successfully" });
      setIsAddOpen(false);
      form.reset({
        teacherId: "",
        amount: "",
        reason: "",
        month: getCurrentMonthLocal(),
      });
    },
    onError: () => {
      toast({ title: "Failed to add bonus", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/bonuses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
      toast({ title: "Bonus deleted" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Failed to delete bonus", variant: "destructive" });
    },
  });

  const handleSubmit = (data: BonusFormValues) => {
    createMutation.mutate(data);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/bonuses/import-from-sheets", {});
    },
    onSuccess: async (res: any) => {
      const data: ImportResult = await res.json();
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bonuses"] });
    },
    onError: () => {
      toast({ title: "Import failed", description: "Check that PAYROLL_SHEET_ID is set and Google is connected.", variant: "destructive" });
    },
  });

  const activeTeachers = teachers.filter(t => t.isActive);
  const teacherMap = new Map(teachers.map(t => [t.id, t.name]));

  const generateMonthOptions = () => {
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
  };

  const monthOptions = generateMonthOptions();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">Bonus Management</h2>
          <p className="text-sm text-muted-foreground">Add and manage teacher bonuses</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            data-testid="button-import-bonuses"
          >
            {importMutation.isPending ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />}
            Import from Sheets
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-bonus">
                <Plus className="h-4 w-4" />
                Add Bonus
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Bonus</DialogTitle>
              <DialogDescription>Add a bonus to a teacher's pay for a specific month.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="teacherId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teacher</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bonus-teacher">
                            <SelectValue placeholder="Select a teacher" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeTeachers.map((teacher) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-bonus-month">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {monthOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (R)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0" 
                          placeholder="50.00" 
                          {...field} 
                          data-testid="input-bonus-amount" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Performance bonus, holiday bonus, etc." 
                          {...field} 
                          data-testid="input-bonus-reason" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-bonus">
                    {createMutation.isPending ? <LoadingSpinner size="sm" /> : "Add Bonus"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Import result dialog */}
      <Dialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Complete</DialogTitle>
            <DialogDescription>Historical bonuses have been imported from Google Sheets.</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{importResult.imported}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Imported</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-2xl font-bold">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Already existed</p>
                </div>
              </div>
              {importResult.unmatched.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                    Could not match {importResult.unmatched.length} teacher name{importResult.unmatched.length !== 1 ? "s" : ""} from the sheet:
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">{importResult.unmatched.join(", ")}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Make sure the teacher names in the sheet match those in the app.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">View Bonuses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Teacher</label>
              <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                <SelectTrigger data-testid="select-view-teacher">
                  <SelectValue placeholder="Select a teacher to view bonuses" />
                </SelectTrigger>
                <SelectContent>
                  {activeTeachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger data-testid="select-view-month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedTeacher ? (
            <EmptyState
              icon={Gift}
              title="Select a Teacher"
              description="Choose a teacher from the dropdown to view their bonuses."
            />
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : bonuses.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No Bonuses"
              description={`No bonuses found for ${teacherMap.get(selectedTeacher)} in ${format(new Date(selectedMonth + "-01"), "MMMM yyyy")}.`}
            />
          ) : (
            <div className="space-y-3">
              {bonuses.map((bonus) => (
                <div 
                  key={bonus.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`bonus-item-${bonus.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">R{parseFloat(bonus.amount).toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">{bonus.reason}</p>
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
                    className="text-destructive"
                    data-testid={`button-delete-bonus-${bonus.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium">
                  Total Bonuses: <span className="text-primary">R{bonuses.reduce((sum, b) => sum + parseFloat(b.amount), 0).toFixed(2)}</span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bonus?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the R{deleteTarget ? parseFloat(deleteTarget.amount).toFixed(2) : ""} bonus. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
