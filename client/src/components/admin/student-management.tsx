import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { Users, Plus, Edit2, Trash2, ChevronRight, Package, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Teacher } from "@shared/schema";

interface Student {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  isArc: boolean;
  isActive: boolean;
  notes: string | null;
}

interface StudentWithBalance extends Student {
  totalPurchased: number;
  totalUsed: number;
  remaining: number;
  lastLessonDate: string | null;
}

interface StudentPackage {
  id: string;
  studentId: string;
  minutesPurchased: number;
  purchaseDate: string;
  notes: string | null;
  importedFromSheet: boolean;
}

const studentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  teacherId: z.string().min(1, "Teacher is required"),
  isArc: z.boolean().default(false),
  notes: z.string().optional(),
});

const packageFormSchema = z.object({
  minutesPurchased: z.coerce.number().min(1, "Must be at least 1 minute"),
  purchaseDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;
type PackageFormValues = z.infer<typeof packageFormSchema>;

function formatMinutes(minutes: number) {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${h}h ${m}m`;
}

function StudentDetail({ student, teachers, onBack }: { student: StudentWithBalance; teachers: Teacher[]; onBack: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddPackage, setShowAddPackage] = useState(false);
  const [deletePackageId, setDeletePackageId] = useState<string | null>(null);

  const { data: packages = [], isLoading } = useQuery<StudentPackage[]>({
    queryKey: [`/api/admin/students/${student.id}/packages`],
  });

  const packageForm = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: { minutesPurchased: 60, purchaseDate: new Date().toISOString().split("T")[0], notes: "" },
  });

  const addPackageMutation = useMutation({
    mutationFn: (data: PackageFormValues) => apiRequest("POST", `/api/admin/students/${student.id}/packages`, data),
    onSuccess: () => {
      toast({ title: "Top-up added" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/students/${student.id}/packages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      packageForm.reset({ minutesPurchased: 60, purchaseDate: new Date().toISOString().split("T")[0], notes: "" });
      setShowAddPackage(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to add top-up.", variant: "destructive" }),
  });

  const deletePackageMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/students/packages/${id}`),
    onSuccess: () => {
      toast({ title: "Top-up removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/students/${student.id}/packages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      setDeletePackageId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to remove top-up.", variant: "destructive" }),
  });

  const balanceColor = student.remaining < 0 ? "text-red-600" : student.remaining < 120 ? "text-yellow-600" : "text-green-600";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div>
          <h2 className="text-xl font-medium">{student.name}</h2>
          <p className="text-sm text-muted-foreground">{student.teacherName} · {student.isArc ? "ARC" : "Regular"}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Purchased</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatMinutes(student.totalPurchased)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Used</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatMinutes(student.totalUsed)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Remaining</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${balanceColor}`}>{formatMinutes(student.remaining)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top-up History</CardTitle>
          <Button size="sm" onClick={() => setShowAddPackage(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Top-up
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? <LoadingSpinner /> : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No top-ups recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Minutes</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>{pkg.purchaseDate}</TableCell>
                    <TableCell>{formatMinutes(pkg.minutesPurchased)}</TableCell>
                    <TableCell className="text-muted-foreground">{pkg.notes || "—"}</TableCell>
                    <TableCell>{pkg.importedFromSheet ? <Badge variant="outline">Imported</Badge> : <Badge variant="outline">Manual</Badge>}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletePackageId(pkg.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add top-up dialog */}
      <Dialog open={showAddPackage} onOpenChange={setShowAddPackage}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Top-up</DialogTitle></DialogHeader>
          <Form {...packageForm}>
            <form onSubmit={packageForm.handleSubmit((d) => addPackageMutation.mutate(d))} className="space-y-4">
              <FormField control={packageForm.control} name="minutesPurchased" render={({ field }) => (
                <FormItem>
                  <FormLabel>Minutes Purchased</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={packageForm.control} name="purchaseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={packageForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl><Input placeholder="e.g. WeChat payment" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddPackage(false)}>Cancel</Button>
                <Button type="submit" disabled={addPackageMutation.isPending}>
                  {addPackageMutation.isPending ? <LoadingSpinner /> : "Add Top-up"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete package confirmation */}
      <AlertDialog open={!!deletePackageId} onOpenChange={(o) => !o && setDeletePackageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove top-up?</AlertDialogTitle>
            <AlertDialogDescription>This will adjust the student's balance. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletePackageId && deletePackageMutation.mutate(deletePackageId)} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function StudentManagement({ teachers }: { teachers: Teacher[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStudent, setSelectedStudent] = useState<StudentWithBalance | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editStudent, setEditStudent] = useState<StudentWithBalance | null>(null);
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: students = [], isLoading } = useQuery<StudentWithBalance[]>({
    queryKey: ["/api/admin/students"],
  });

  const activeTeachers = teachers.filter(t => t.role !== "admin" && t.isActive);

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: { name: "", teacherId: "", isArc: false, notes: "" },
  });

  const editForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
  });

  const addMutation = useMutation({
    mutationFn: (data: StudentFormValues) => apiRequest("POST", "/api/admin/students", data),
    onSuccess: () => {
      toast({ title: "Student added" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-tracker"] });
      form.reset({ name: "", teacherId: "", isArc: false, notes: "" });
      setShowAddDialog(false);
    },
    onError: () => toast({ title: "Error", description: "Failed to add student.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StudentFormValues> }) =>
      apiRequest("PATCH", `/api/admin/students/${id}`, data),
    onSuccess: () => {
      toast({ title: "Student updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-tracker"] });
      setEditStudent(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to update student.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/students/${id}`),
    onSuccess: () => {
      toast({ title: "Student deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/student-tracker"] });
      setDeleteStudentId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete student.", variant: "destructive" }),
  });

  if (selectedStudent) {
    return (
      <StudentDetail
        student={selectedStudent}
        teachers={teachers}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.teacherName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Students</h1>
          <p className="text-muted-foreground">Manage students, lesson packages and balances</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Student
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by name or teacher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Users} title="No students found" description={search ? "Try a different search." : "Add your first student to get started."} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Last Lesson</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((student) => {
                  const balanceColor = student.remaining < 0 ? "text-red-600" : student.remaining < 120 ? "text-yellow-600" : "text-green-600";
                  return (
                    <TableRow key={student.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedStudent(student)}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.teacherName}</TableCell>
                      <TableCell>{student.isArc ? <Badge variant="outline">ARC</Badge> : <Badge variant="secondary">Regular</Badge>}</TableCell>
                      <TableCell className={balanceColor}>{formatMinutes(student.remaining)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {student.lastLessonDate ? new Date(student.lastLessonDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={student.isActive ? "default" : "secondary"}>
                          {student.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                            e.stopPropagation();
                            editForm.reset({ name: student.name, teacherId: student.teacherId, isArc: student.isArc, notes: student.notes ?? "" });
                            setEditStudent(student);
                          }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteStudentId(student.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add student dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => addMutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Student name" {...field} /></FormControl><FormMessage /></FormItem>
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
              <FormField control={form.control} name="isArc" render={({ field }) => (
                <FormItem>
                  <FormLabel>Student Type</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="false">Regular</SelectItem>
                      <SelectItem value="true">ARC</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? <LoadingSpinner /> : "Add Student"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog open={!!editStudent} onOpenChange={(o) => !o && setEditStudent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Student</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((d) => editStudent && updateMutation.mutate({ id: editStudent.id, data: d }))} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
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
              <FormField control={editForm.control} name="isArc" render={({ field }) => (
                <FormItem>
                  <FormLabel>Student Type</FormLabel>
                  <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="false">Regular</SelectItem>
                      <SelectItem value="true">ARC</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditStudent(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <LoadingSpinner /> : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteStudentId} onOpenChange={(o) => !o && setDeleteStudentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete student?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the student and all their package history. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteStudentId && deleteMutation.mutate(deleteStudentId)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
