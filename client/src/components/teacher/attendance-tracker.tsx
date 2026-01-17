import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { FileSpreadsheet, Lock, Edit2, Save, X, RefreshCw, Search } from "lucide-react";
import type { AttendanceRow } from "@shared/schema";

interface AttendanceTrackerProps {
  rows: AttendanceRow[];
  isLoading: boolean;
  onUpdate: (rowIndex: number, field: "attendance" | "notes", value: string) => Promise<void>;
  onRefresh: () => void;
}

const attendanceOptions = [
  { value: "present", label: "Present", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  { value: "absent", label: "Absent", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  { value: "late", label: "Late", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "excused", label: "Excused", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
];

export function AttendanceTracker({ rows, isLoading, onUpdate, onRefresh }: AttendanceTrackerProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ attendance: string; notes: string }>({ attendance: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = rows.filter(row => 
    row.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.date.includes(searchQuery)
  );

  const startEdit = (row: AttendanceRow) => {
    setEditingRow(row.rowIndex);
    setEditValues({ attendance: row.attendance, notes: row.notes });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValues({ attendance: "", notes: "" });
  };

  const saveEdit = async (rowIndex: number) => {
    setIsSaving(true);
    try {
      await onUpdate(rowIndex, "attendance", editValues.attendance);
      await onUpdate(rowIndex, "notes", editValues.notes);
      setEditingRow(null);
    } finally {
      setIsSaving(false);
    }
  };

  const getAttendanceColor = (value: string) => {
    return attendanceOptions.find(opt => opt.value === value)?.color || "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Student Attendance</h2>
          <p className="text-sm text-muted-foreground">Update attendance and notes for your classes</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students or dates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
              data-testid="input-search-attendance"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            data-testid="button-refresh-attendance"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-muted-foreground">Editable:</span>
        <Badge variant="outline" className="gap-1">
          <Edit2 className="h-3 w-3" />
          Attendance, Notes
        </Badge>
        <span className="text-muted-foreground">Protected:</span>
        <Badge variant="secondary" className="gap-1">
          <Lock className="h-3 w-3" />
          Lesson Plan, Homework
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No Attendance Records"
          description={searchQuery ? "No records match your search." : "No attendance records found. They will appear here when synced from Google Sheets."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[100px]">Date</TableHead>
                    <TableHead className="min-w-[150px]">Student</TableHead>
                    <TableHead className="min-w-[100px]">Time</TableHead>
                    <TableHead className="min-w-[120px]">
                      <div className="flex items-center gap-1">
                        Attendance
                        <Edit2 className="h-3 w-3 text-primary" />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[200px]">
                      <div className="flex items-center gap-1">
                        Notes
                        <Edit2 className="h-3 w-3 text-primary" />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[150px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Lesson Plan
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.rowIndex} data-testid={`row-attendance-${row.rowIndex}`}>
                      <TableCell className="font-medium">{row.date}</TableCell>
                      <TableCell>{row.studentName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.classTime}</TableCell>
                      <TableCell>
                        {editingRow === row.rowIndex ? (
                          <Select
                            value={editValues.attendance}
                            onValueChange={(val) => setEditValues({ ...editValues, attendance: val })}
                          >
                            <SelectTrigger className="w-28" data-testid="select-attendance">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {attendanceOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={getAttendanceColor(row.attendance)}>
                            {row.attendance || "—"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingRow === row.rowIndex ? (
                          <Input
                            value={editValues.notes}
                            onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                            placeholder="Add notes..."
                            className="min-w-[180px]"
                            data-testid="input-notes"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{row.notes || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {row.lessonPlan || "—"}
                      </TableCell>
                      <TableCell>
                        {editingRow === row.rowIndex ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => saveEdit(row.rowIndex)}
                              disabled={isSaving}
                              data-testid="button-save-attendance"
                            >
                              {isSaving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4 text-green-600" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              data-testid="button-cancel-edit"
                            >
                              <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(row)}
                            data-testid={`button-edit-${row.rowIndex}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
