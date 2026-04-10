import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { CalendarDays, Plus, Trash2, Edit2, Download, Eye, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface MasterScheduleEntry {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  frequency: string;
  isActive: boolean;
  notes: string | null;
}

interface Student {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  isActive: boolean;
  isArc: boolean;
}

const scheduleFormSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  teacherId: z.string().min(1, "Teacher is required"),
  dayOfWeek: z.coerce.number().min(0).max(6),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  frequency: z.enum(["weekly", "biweekly"]),
  notes: z.string().optional(),
});

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

interface SheetSettings { spreadsheetId: string; tabName: string; }
interface PreviewEntry { studentName: string; teacherName: string; day: number; startTime: string; endTime: string; }

export function MasterSchedule({ teachers }: { teachers: Teacher[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<MasterScheduleEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterDay, setFilterDay] = useState<string>("all");
  const [filterTeacher, setFilterTeacher] = useState<string>("all");
  const [showImport, setShowImport] = useState(false);
  const [sheetId, setSheetId] = useState("");
  const [sheetTab, setSheetTab] = useState("Master Schedule");
  const [clearExisting, setClearExisting] = useState(false);
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [importResult, setImportResult] = useState<{ entriesCreated: number; errors: string[] } | null>(null);

  const { data: schedules = [], isLoading } = useQuery<MasterScheduleEntry[]>({
    queryKey: ["/api/admin/master-schedule"],
  });

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ["/api/admin/students"],
  });

  const { data: sheetSettings } = useQuery<SheetSettings>({
    queryKey: ["/api/admin/settings/master-schedule-sheet"],
  });

  useEffect(() => {
    if (sheetSettings?.spreadsheetId) setSheetId(sheetSettings.spreadsheetId);
    if (sheetSettings?.tabName) setSheetTab(sheetSettings.tabName);
  }, [sheetSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/settings/master-schedule-sheet", { spreadsheetId: sheetId, tabName: sheetTab }),
  });

  const previewImportMutation = useMutation<{ entries: PreviewEntry[]; errors: string[] }>({
    mutationFn: async () => {
      await saveSettingsMutation.mutateAsync();
      const res = await apiRequest("POST", "/api/admin/import-master-schedule", { spreadsheetId: sheetId, tabName: sheetTab, dryRun: true });
      return res.json();
    },
    onSuccess: (d) => { setPreview(d.entries); setImportResult(null); },
    onError: (e: any) => toast({ title: "Preview failed", description: e?.message || "Could not read sheet.", variant: "destructive" }),
  });

  const runImportMutation = useMutation<{ entriesCreated: number; errors: string[] }>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/import-master-schedule", { spreadsheetId: sheetId, tabName: sheetTab, dryRun: false, clearExisting });
      return res.json();
    },
    onSuccess: (d) => {
      setImportResult(d);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-schedule"] });
      toast({ title: "Import complete", description: `${d.entriesCreated} entries created.` });
    },
    onError: (e: any) => toast({ title: "Import failed", description: e?.message || "Something went wrong.", variant: "destructive" }),
  });

  const activeTeachers = teachers.filter(t => t.role !== "admin" && t.isActive);
  const activeStudents = students.filter(s => s.isActive && !s.isArc);

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: { studentId: "", teacherId: "", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", frequency: "weekly", notes: "" },
  });

  const editForm = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
  });

  const addMutation = useMutation({
    mutationFn: (data: ScheduleFormValues) => apiRequest("POST", "/api/admin/master-schedule", data),
    onSuccess: () => {
      toast({ title: "Schedule entry added" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-schedule"] });
      form.reset({ studentId: "", teacherId: "", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", frequency: "weekly", notes: "" });
      setShowAddDialog(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to add schedule entry.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScheduleFormValues> }) =>
      apiRequest("PATCH", `/api/admin/master-schedule/${id}`, data),
    onSuccess: () => {
      toast({ title: "Schedule entry updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-schedule"] });
      setEditEntry(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update schedule entry.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/master-schedule/${id}`),
    onSuccess: () => {
      toast({ title: "Schedule entry removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/master-schedule"] });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to remove entry.", variant: "destructive" }),
  });


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Master Schedule</h1>
          <p className="text-muted-foreground">Planned recurring lesson schedule — separate from the live calendar</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setShowImport(!showImport); setPreview(null); setImportResult(null); }}>
            <Download className="h-4 w-4 mr-1" /> Import from Sheets
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Entry
          </Button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Import from Google Sheets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reads your master schedule grid — each teacher column is matched by name, student entries are parsed from cells like <code className="bg-muted px-1 rounded text-xs">Alan (10:25–10:55)</code>.
              Teachers must already exist in the app. Students will be created automatically if missing.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Spreadsheet ID</Label>
                <Input placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" value={sheetId} onChange={e => setSheetId(e.target.value)} />
                <p className="text-xs text-muted-foreground">The long ID from the sheet URL: /spreadsheets/d/<strong>ID</strong>/edit</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Tab name</Label>
                <Input value={sheetTab} onChange={e => setSheetTab(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="clearMs" checked={clearExisting} onCheckedChange={v => setClearExisting(!!v)} />
              <Label htmlFor="clearMs" className="text-sm">Clear all existing master schedule entries before importing</Label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!sheetId || previewImportMutation.isPending || runImportMutation.isPending} onClick={() => previewImportMutation.mutate()}>
                {previewImportMutation.isPending ? <LoadingSpinner /> : <><Eye className="h-4 w-4 mr-1" />Preview</>}
              </Button>
              <Button disabled={!preview || runImportMutation.isPending} onClick={() => runImportMutation.mutate()}>
                {runImportMutation.isPending ? <LoadingSpinner /> : <><Download className="h-4 w-4 mr-1" />Run Import</>}
              </Button>
            </div>

            {/* Preview results */}
            {preview && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{preview.length} entries found — review before importing:</p>
                <div className="max-h-64 overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Teacher</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.studentName}</TableCell>
                          <TableCell>{e.teacherName}</TableCell>
                          <TableCell>{DAYS[e.day]}</TableCell>
                          <TableCell>{e.startTime} – {e.endTime}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="space-y-2">
                <p className="text-sm text-green-700 font-medium">{importResult.entriesCreated} entries imported successfully.</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Day filter */}
      <div className="flex gap-3">
        <Select value={filterDay} onValueChange={setFilterDay}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All days" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All days</SelectItem>
            {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All teachers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teachers</SelectItem>
            {activeTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex justify-center p-8"><LoadingSpinner /></div>
      ) : schedules.length === 0 ? (
        <Card><CardContent className="p-0"><EmptyState icon={CalendarDays} title="No schedule entries" description="Import from Sheets or add entries manually." /></CardContent></Card>
      ) : (() => {
        const PX_PER_MIN = 2;
        const COL_W = 140;
        const TIME_W = 56;

        function toMin(t: string) {
          const [h, m] = t.slice(0, 5).split(":").map(Number);
          return h * 60 + m;
        }
        function fmt12(totalMin: number) {
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
        }

        const visibleDays = filterDay === "all"
          ? Array.from(new Set(schedules.map(s => s.dayOfWeek))).sort((a, b) => a - b)
          : [Number(filterDay)];
        const visibleTeachers = filterTeacher === "all"
          ? Array.from(new Set(schedules.map(s => s.teacherName))).sort()
          : [activeTeachers.find(t => t.id === filterTeacher)?.name ?? ""].filter(Boolean);

        const cols: { day: number; teacherName: string }[] = [];
        for (const day of visibleDays)
          for (const t of visibleTeachers)
            if (schedules.some(s => s.dayOfWeek === day && s.teacherName === t))
              cols.push({ day, teacherName: t });

        const visibleEntries = schedules.filter(s =>
          visibleDays.includes(s.dayOfWeek) && visibleTeachers.includes(s.teacherName)
        );

        const allStartMins = visibleEntries.map(s => toMin(s.startTime));
        const allEndMins = visibleEntries.map(s => toMin(s.endTime));
        const rangeStart = Math.floor(Math.min(...allStartMins) / 60) * 60;
        const rangeEnd = Math.ceil(Math.max(...allEndMins) / 60) * 60;
        const totalMins = rangeEnd - rangeStart;
        const totalHeight = totalMins * PX_PER_MIN;

        const hourMarks: { min: number; label: string }[] = [];
        for (let m = rangeStart; m <= rangeEnd; m += 60)
          hourMarks.push({ min: m, label: fmt12(m) });

        const dayGroups: { day: number; count: number }[] = [];
        for (const col of cols) {
          const last = dayGroups[dayGroups.length - 1];
          if (last && last.day === col.day) last.count++;
          else dayGroups.push({ day: col.day, count: 1 });
        }

        const palette = [
          "bg-blue-200 text-blue-900 border-blue-300",
          "bg-green-200 text-green-900 border-green-300",
          "bg-purple-200 text-purple-900 border-purple-300",
          "bg-orange-200 text-orange-900 border-orange-300",
          "bg-pink-200 text-pink-900 border-pink-300",
          "bg-teal-200 text-teal-900 border-teal-300",
          "bg-yellow-200 text-yellow-900 border-yellow-300",
          "bg-red-200 text-red-900 border-red-300",
          "bg-indigo-200 text-indigo-900 border-indigo-300",
          "bg-cyan-200 text-cyan-900 border-cyan-300",
        ];
        const colorMap = new Map<string, string>();
        Array.from(new Set(schedules.map(s => s.studentName))).sort().forEach((name, i) => {
          colorMap.set(name, palette[i % palette.length]);
        });

        const totalWidth = TIME_W + cols.length * COL_W;

        return (
          <div className="border rounded-lg overflow-hidden">
            {/* Sticky double header */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: totalWidth }}>
                {/* Row 1: Day names */}
                <div className="flex bg-muted border-b">
                  <div style={{ width: TIME_W, minWidth: TIME_W }} className="shrink-0 border-r" />
                  {dayGroups.map(({ day, count }) => (
                    <div key={day} style={{ width: count * COL_W, minWidth: count * COL_W }}
                         className="border-r text-center font-semibold text-sm py-2">
                      {DAYS[day]}
                    </div>
                  ))}
                </div>
                {/* Row 2: Teacher names */}
                <div className="flex bg-muted/60 border-b">
                  <div style={{ width: TIME_W, minWidth: TIME_W }} className="shrink-0 border-r" />
                  {cols.map((col, i) => (
                    <div key={i} style={{ width: COL_W, minWidth: COL_W }}
                         className="border-r text-center text-xs text-muted-foreground font-medium py-1.5 truncate px-1">
                      {col.teacherName}
                    </div>
                  ))}
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto" style={{ maxHeight: 620 }}>
                  <div className="flex" style={{ height: totalHeight }}>
                    {/* Time axis */}
                    <div style={{ width: TIME_W, minWidth: TIME_W, height: totalHeight }}
                         className="shrink-0 relative border-r bg-muted/30">
                      {hourMarks.map(({ min, label }) => (
                        <div key={min} style={{ position: "absolute", top: (min - rangeStart) * PX_PER_MIN - 8, left: 0, right: 0 }}
                             className="text-[10px] text-muted-foreground text-right pr-2 leading-none select-none">
                          {label}
                        </div>
                      ))}
                    </div>

                    {/* Teacher-day columns */}
                    {cols.map((col, ci) => {
                      const colLessons = schedules.filter(s =>
                        s.dayOfWeek === col.day && s.teacherName === col.teacherName
                      );
                      return (
                        <div key={ci} style={{ width: COL_W, minWidth: COL_W, height: totalHeight }}
                             className="shrink-0 relative border-r">
                          {/* Hour grid lines */}
                          {hourMarks.map(({ min }) => (
                            <div key={min} style={{ position: "absolute", top: (min - rangeStart) * PX_PER_MIN, left: 0, right: 0 }}
                                 className="border-t border-muted-foreground/10" />
                          ))}
                          {/* Lesson blocks */}
                          {colLessons.map(entry => {
                            const top = (toMin(entry.startTime) - rangeStart) * PX_PER_MIN;
                            const height = Math.max((toMin(entry.endTime) - toMin(entry.startTime)) * PX_PER_MIN, 24);
                            const color = colorMap.get(entry.studentName) ?? "bg-gray-200 text-gray-900 border-gray-300";
                            return (
                              <div key={entry.id}
                                   style={{ position: "absolute", top, height, left: 3, right: 3 }}
                                   className={`rounded border text-xs overflow-hidden group cursor-pointer ${color}`}>
                                <div className="px-1.5 pt-0.5 font-semibold leading-tight truncate">{entry.studentName}</div>
                                <div className="px-1.5 text-[10px] opacity-75 leading-tight">
                                  {entry.startTime.slice(0, 5)} – {entry.endTime.slice(0, 5)}
                                </div>
                                {/* Edit/delete — visible on hover */}
                                <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5 bg-white/70 rounded px-0.5">
                                  <button onClick={() => {
                                    editForm.reset({
                                      studentId: entry.studentId, teacherId: entry.teacherId,
                                      dayOfWeek: entry.dayOfWeek, startTime: entry.startTime.slice(0, 5),
                                      endTime: entry.endTime.slice(0, 5),
                                      frequency: entry.frequency as "weekly" | "biweekly",
                                      notes: entry.notes ?? "",
                                    });
                                    setEditEntry(entry);
                                  }}><Edit2 className="h-3 w-3" /></button>
                                  <button onClick={() => setDeleteId(entry.id)}>
                                    <Trash2 className="h-3 w-3 text-red-600" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Add dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Schedule Entry</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => addMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="studentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Student</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="teacherId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teacher</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="dayOfWeek" render={({ field }) => (
                <FormItem>
                  <FormLabel>Day</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="endTime" render={({ field }) => (
                  <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="frequency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? <LoadingSpinner /> : "Add Entry"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Schedule Entry</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((d) => editEntry && updateMutation.mutate({ id: editEntry.id, data: d }))} className="space-y-4">
              <FormField control={editForm.control} name="studentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Student</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeStudents.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="teacherId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teacher</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {activeTeachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="dayOfWeek" render={({ field }) => (
                <FormItem>
                  <FormLabel>Day</FormLabel>
                  <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="startTime" render={({ field }) => (
                  <FormItem><FormLabel>Start Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="endTime" render={({ field }) => (
                  <FormItem><FormLabel>End Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="frequency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <LoadingSpinner /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove schedule entry?</AlertDialogTitle>
            <AlertDialogDescription>This only removes the planned schedule — it does not affect existing calendar events.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
