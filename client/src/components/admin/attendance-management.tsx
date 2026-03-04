import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Plus, Pencil, Trash2, Save, X, Download, FileSpreadsheet,
  BookOpen, GraduationCap, RefreshCw, ArrowLeft, ChevronDown, List
} from "lucide-react";
import type { Teacher } from "@shared/schema";

interface Student {
  id: string;
  teacherId: string;
  name: string;
  courseName: string | null;
  sheetTab: string | null;
  dropdownOptions: string[] | null;
  createdAt: string;
}

interface LessonRecord {
  id: string;
  teacherId: string;
  studentId: string;
  lessonNo: string | null;
  date: string | null;
  lessonDetails: string | null;
  teacher: string | null;
  lessonTimePurchased: string | null;
  lessonDuration: string | null;
  remainingTime: string | null;
  referralCredits: string | null;
  notes: string | null;
  dropdownOptions: string[] | null;
  sheetRowIndex: number | null;
}

interface AttendanceManagementProps {
  teachers: Teacher[];
}

export function AttendanceManagement({ teachers }: AttendanceManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [editStudentOpen, setEditStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [addRecordOpen, setAddRecordOpen] = useState(false);
  const [newRecordFields, setNewRecordFields] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<Student | null>(null);
  const [newDropdownOption, setNewDropdownOption] = useState("");
  const [dropdownOptionsOpen, setDropdownOptionsOpen] = useState(false);

  const activeTeachers = teachers.filter(t => t.role === "teacher" && t.isActive);

  const { data: studentList = [], isLoading: studentsLoading } = useQuery<Student[]>({
    queryKey: ["/api/admin/students", selectedTeacherId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/students/${selectedTeacherId}`);
      if (!res.ok) throw new Error("Failed to fetch students");
      return res.json();
    },
    enabled: !!selectedTeacherId,
  });

  const selectedStudent = studentList.find(s => s.id === selectedStudentId);

  const { data: records = [], isLoading: recordsLoading, refetch: refetchRecords } = useQuery<LessonRecord[]>({
    queryKey: ["/api/admin/attendance", selectedStudentId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/attendance/${selectedStudentId}`);
      if (!res.ok) throw new Error("Failed to fetch records");
      return res.json();
    },
    enabled: !!selectedStudentId,
  });

  const addStudentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/students/${selectedTeacherId}`, {
        name: newStudentName,
        courseName: newCourseName || newStudentName,
      });
    },
    onSuccess: () => {
      toast({ title: "Student added" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students", selectedTeacherId] });
      setAddStudentOpen(false);
      setNewStudentName("");
      setNewCourseName("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStudentMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; courseName?: string; dropdownOptions?: string[] }) => {
      return apiRequest("PATCH", `/api/admin/students/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Student updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students", selectedTeacherId] });
      setEditStudentOpen(false);
      setEditingStudent(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/students/${id}`),
    onSuccess: () => {
      toast({ title: "Student deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students", selectedTeacherId] });
      if (deleteStudentTarget?.id === selectedStudentId) setSelectedStudentId("");
      setDeleteStudentTarget(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, string> }) => {
      return apiRequest("PATCH", `/api/admin/attendance/${id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Record updated" });
      refetchRecords();
      setEditingRecordId(null);
      setEditFields({});
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRecordMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/attendance/${selectedStudentId}`, newRecordFields);
    },
    onSuccess: () => {
      toast({ title: "Record added" });
      refetchRecords();
      setAddRecordOpen(false);
      setNewRecordFields({});
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteRecordMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/attendance/${id}`),
    onSuccess: () => {
      toast({ title: "Record deleted" });
      refetchRecords();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleImport = async (teacherId?: string) => {
    setIsImporting(true);
    try {
      const url = teacherId
        ? `/api/admin/import-attendance/${teacherId}`
        : "/api/admin/import-attendance-all";
      const res = await apiRequest("POST", url);
      const data = await res.json();
      toast({ title: "Import complete", description: teacherId ? `${data.recordsImported} records imported` : `Imported data for ${data.results?.length || 0} teachers` });
      if (selectedTeacherId) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/students", selectedTeacherId] });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const startEditRecord = (record: LessonRecord) => {
    setEditingRecordId(record.id);
    setEditFields({
      lessonNo: record.lessonNo || "",
      date: record.date || "",
      lessonDetails: record.lessonDetails || "",
      teacher: record.teacher || "",
      lessonTimePurchased: record.lessonTimePurchased || "",
      lessonDuration: record.lessonDuration || "",
      remainingTime: record.remainingTime || "",
      referralCredits: record.referralCredits || "",
      notes: record.notes || "",
    });
  };

  const handleAddDropdownOption = () => {
    if (!newDropdownOption.trim() || !selectedStudent) return;
    const currentOptions = selectedStudent.dropdownOptions || [];
    if (currentOptions.includes(newDropdownOption.trim())) {
      toast({ title: "Option already exists", variant: "destructive" });
      return;
    }
    const updatedOptions = [...currentOptions, newDropdownOption.trim()];
    updateStudentMutation.mutate({ id: selectedStudent.id, dropdownOptions: updatedOptions });
    setNewDropdownOption("");
  };

  const handleRemoveDropdownOption = (option: string) => {
    if (!selectedStudent) return;
    const updatedOptions = (selectedStudent.dropdownOptions || []).filter(o => o !== option);
    updateStudentMutation.mutate({ id: selectedStudent.id, dropdownOptions: updatedOptions });
  };

  const columns = [
    { key: "lessonNo", label: "No.", width: "60px" },
    { key: "date", label: "Date", width: "100px" },
    { key: "lessonDetails", label: "Lesson Details", width: "160px" },
    { key: "teacher", label: "Teacher", width: "100px" },
    { key: "lessonTimePurchased", label: "Time Purchased", width: "110px" },
    { key: "lessonDuration", label: "Duration", width: "90px" },
    { key: "remainingTime", label: "Remaining", width: "90px" },
    { key: "referralCredits", label: "Referral", width: "80px" },
    { key: "notes", label: "Notes", width: "160px" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium" data-testid="text-attendance-title">Lesson Tracker Management</h1>
          <p className="text-muted-foreground">Manage students and lesson records for teachers</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleImport(selectedTeacherId || undefined)}
            disabled={isImporting}
            data-testid="button-import-sheets"
          >
            {isImporting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {selectedTeacherId ? "Import from Sheets" : "Import All from Sheets"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="mb-2 block">Teacher</Label>
          <Select value={selectedTeacherId} onValueChange={(v) => { setSelectedTeacherId(v); setSelectedStudentId(""); }}>
            <SelectTrigger data-testid="select-teacher-trigger">
              <SelectValue placeholder="Select a teacher..." />
            </SelectTrigger>
            <SelectContent>
              {activeTeachers.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedTeacherId && !selectedStudentId && (
          <div>
            <Label className="mb-2 block">Student</Label>
            <div className="flex gap-2">
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger data-testid="select-student-trigger" className="flex-1">
                  <SelectValue placeholder={studentsLoading ? "Loading..." : "Select a student..."} />
                </SelectTrigger>
                <SelectContent>
                  {studentList.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.courseName && s.courseName !== s.name ? ` (${s.courseName})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" onClick={() => setAddStudentOpen(true)} data-testid="button-add-student">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedTeacherId && !selectedStudentId && studentList.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Students ({studentList.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Dropdown Options</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studentList.map(student => (
                    <TableRow
                      key={student.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelectedStudentId(student.id)}
                      data-testid={`row-student-${student.id}`}
                    >
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="text-muted-foreground">{student.courseName || "—"}</TableCell>
                      <TableCell>
                        {student.dropdownOptions && student.dropdownOptions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {student.dropdownOptions.slice(0, 3).map(opt => (
                              <Badge key={opt} variant="secondary" className="text-xs">{opt}</Badge>
                            ))}
                            {student.dropdownOptions.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{student.dropdownOptions.length - 3}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingStudent(student); setEditStudentOpen(true); }} data-testid={`button-edit-student-${student.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteStudentTarget(student)} data-testid={`button-delete-student-${student.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedStudentId && selectedStudent && (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedStudentId("")}
              data-testid="button-back-to-students"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to students
            </Button>
            <div className="flex items-center gap-2 flex-1">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-medium" data-testid="text-selected-student-name">{selectedStudent.name}</h2>
              {selectedStudent.courseName && selectedStudent.courseName !== selectedStudent.name && (
                <span className="text-muted-foreground">({selectedStudent.courseName})</span>
              )}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingStudent(selectedStudent); setEditStudentOpen(true); }} data-testid="button-edit-selected-student">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteStudentTarget(selectedStudent)} data-testid="button-delete-selected-student">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="py-3 cursor-pointer" onClick={() => setDropdownOptionsOpen(!dropdownOptionsOpen)}>
              <CardTitle className="text-base flex items-center gap-2">
                <List className="h-4 w-4" />
                Lesson Detail Dropdown Options
                {selectedStudent.dropdownOptions && selectedStudent.dropdownOptions.length > 0 && (
                  <Badge variant="secondary">{selectedStudent.dropdownOptions.length}</Badge>
                )}
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${dropdownOptionsOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
            {dropdownOptionsOpen && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-3">
                  These options appear as a dropdown when teachers edit the "Lesson Details" column for this student.
                </p>
                {selectedStudent.dropdownOptions && selectedStudent.dropdownOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedStudent.dropdownOptions.map(option => (
                      <Badge key={option} variant="secondary" className="text-sm py-1 px-3 gap-1.5" data-testid={`badge-dropdown-option-${option}`}>
                        {option}
                        <button
                          onClick={() => handleRemoveDropdownOption(option)}
                          className="ml-1 hover:text-destructive"
                          data-testid={`button-remove-option-${option}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-3">No dropdown options set. Teachers will see a free text input.</p>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newDropdownOption}
                    onChange={e => setNewDropdownOption(e.target.value)}
                    placeholder="Add a new option..."
                    className="max-w-xs"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddDropdownOption(); } }}
                    data-testid="input-new-dropdown-option"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddDropdownOption}
                    disabled={!newDropdownOption.trim() || updateStudentMutation.isPending}
                    data-testid="button-add-dropdown-option"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Lesson Records
                {records.length > 0 && <Badge variant="secondary">{records.length}</Badge>}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setNewRecordFields({}); setAddRecordOpen(true); }} data-testid="button-add-record">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Record
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recordsLoading ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : records.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={FileSpreadsheet} title="No Records" description="No lesson records yet. Add records or import from Google Sheets." />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map(col => (
                          <TableHead key={col.key} style={{ minWidth: col.width }}>{col.label}</TableHead>
                        ))}
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map(record => (
                        <TableRow key={record.id} data-testid={`row-record-${record.id}`}>
                          {columns.map(col => (
                            <TableCell key={col.key}>
                              {editingRecordId === record.id ? (
                                col.key === "notes" ? (
                                  <textarea
                                    value={editFields[col.key] || ""}
                                    onChange={e => setEditFields(prev => ({ ...prev, [col.key]: e.target.value }))}
                                    className="w-full min-h-[60px] text-sm border rounded px-2 py-1 bg-background"
                                    data-testid={`input-edit-${col.key}`}
                                  />
                                ) : (
                                  <Input
                                    value={editFields[col.key] || ""}
                                    onChange={e => setEditFields(prev => ({ ...prev, [col.key]: e.target.value }))}
                                    className="min-w-[80px] h-8 text-sm"
                                    data-testid={`input-edit-${col.key}`}
                                  />
                                )
                              ) : (
                                <span className={`text-sm ${(record as any)[col.key] ? "" : "text-muted-foreground"}`}>
                                  {col.key === "notes" && (record as any)[col.key]
                                    ? ((record as any)[col.key] as string).length > 40
                                      ? (record as any)[col.key].slice(0, 40) + "..."
                                      : (record as any)[col.key]
                                    : (record as any)[col.key] || "—"}
                                </span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell>
                            {editingRecordId === record.id ? (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateRecordMutation.mutate({ id: record.id, updates: editFields })} disabled={updateRecordMutation.isPending} data-testid="button-save-record">
                                  <Save className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingRecordId(null); setEditFields({}); }} data-testid="button-cancel-record">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditRecord(record)} data-testid={`button-edit-record-${record.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteRecordMutation.mutate(record.id)} data-testid={`button-delete-record-${record.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedTeacherId && (
        <EmptyState icon={GraduationCap} title="Select a Teacher" description="Choose a teacher to manage their students and lesson records." />
      )}

      {selectedTeacherId && !selectedStudentId && studentList.length === 0 && !studentsLoading && (
        <EmptyState icon={Users} title="No Students" description="This teacher has no students yet. Add a student or import from Google Sheets." />
      )}

      <Dialog open={addStudentOpen} onOpenChange={setAddStudentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Student</DialogTitle>
            <DialogDescription>Add a new student to this teacher.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Student Name</Label>
              <Input value={newStudentName} onChange={e => setNewStudentName(e.target.value)} placeholder="e.g. Luke" data-testid="input-student-name" />
            </div>
            <div className="space-y-2">
              <Label>Course Name</Label>
              <Input value={newCourseName} onChange={e => setNewCourseName(e.target.value)} placeholder="e.g. YLE Starters" data-testid="input-course-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStudentOpen(false)}>Cancel</Button>
            <Button onClick={() => addStudentMutation.mutate()} disabled={!newStudentName || addStudentMutation.isPending} data-testid="button-confirm-add-student">
              {addStudentMutation.isPending ? "Adding..." : "Add Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editStudentOpen} onOpenChange={setEditStudentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Student Name</Label>
              <Input value={editingStudent?.name || ""} onChange={e => setEditingStudent(prev => prev ? { ...prev, name: e.target.value } : null)} data-testid="input-edit-student-name" />
            </div>
            <div className="space-y-2">
              <Label>Course Name</Label>
              <Input value={editingStudent?.courseName || ""} onChange={e => setEditingStudent(prev => prev ? { ...prev, courseName: e.target.value } : null)} data-testid="input-edit-course-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStudentOpen(false)}>Cancel</Button>
            <Button onClick={() => editingStudent && updateStudentMutation.mutate({ id: editingStudent.id, name: editingStudent.name, courseName: editingStudent.courseName || "" })} disabled={updateStudentMutation.isPending} data-testid="button-confirm-edit-student">
              {updateStudentMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteStudentTarget} onOpenChange={() => setDeleteStudentTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Student</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleteStudentTarget?.name}? This will also delete all their lesson records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStudentTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteStudentTarget && deleteStudentMutation.mutate(deleteStudentTarget.id)} disabled={deleteStudentMutation.isPending} data-testid="button-confirm-delete-student">
              {deleteStudentMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addRecordOpen} onOpenChange={setAddRecordOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Lesson Record</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {columns.map(col => (
              <div key={col.key} className={col.key === "notes" ? "col-span-2" : ""}>
                <Label className="text-xs">{col.label}</Label>
                {col.key === "notes" ? (
                  <textarea
                    value={newRecordFields[col.key] || ""}
                    onChange={e => setNewRecordFields(prev => ({ ...prev, [col.key]: e.target.value }))}
                    className="w-full min-h-[60px] text-sm border rounded px-2 py-1 bg-background"
                    data-testid={`input-new-${col.key}`}
                  />
                ) : (
                  <Input
                    value={newRecordFields[col.key] || ""}
                    onChange={e => setNewRecordFields(prev => ({ ...prev, [col.key]: e.target.value }))}
                    className="h-8 text-sm"
                    data-testid={`input-new-${col.key}`}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRecordOpen(false)}>Cancel</Button>
            <Button onClick={() => addRecordMutation.mutate()} disabled={addRecordMutation.isPending} data-testid="button-confirm-add-record">
              {addRecordMutation.isPending ? "Adding..." : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
