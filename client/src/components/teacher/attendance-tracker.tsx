import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { FileSpreadsheet, Lock, Edit2, Save, X, RefreshCw, Search, Users, MessageCircle } from "lucide-react";
import type { AttendanceRow, SheetTab } from "@shared/schema";

const READ_NOTES_KEY = "teacher-portal-read-notes";

function getReadNotes(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(READ_NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

function getNoteKey(tab: string, rowIndex: number, note: string): string {
  return `${tab}:${rowIndex}:${note}`;
}

function markNoteRead(tab: string, rowIndex: number, note: string) {
  const read = getReadNotes();
  read[getNoteKey(tab, rowIndex, note)] = true;
  localStorage.setItem(READ_NOTES_KEY, JSON.stringify(read));
}

function isNoteRead(tab: string, rowIndex: number, note: string): boolean {
  const read = getReadNotes();
  return !!read[getNoteKey(tab, rowIndex, note)];
}

interface AttendanceTrackerProps {
  tabs: SheetTab[];
  rows: AttendanceRow[];
  isLoadingTabs: boolean;
  isLoadingRows: boolean;
  selectedTab: string;
  onSelectTab: (tab: string) => void;
  onUpdate: (rowIndex: number, value: string) => Promise<void>;
  onRefresh: () => void;
}

export function AttendanceTracker({ 
  tabs, 
  rows, 
  isLoadingTabs, 
  isLoadingRows, 
  selectedTab, 
  onSelectTab, 
  onUpdate, 
  onRefresh 
}: AttendanceTrackerProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [readNotes, setReadNotes] = useState<Record<string, boolean>>(getReadNotes);

  const filteredRows = rows.filter(row => 
    row.date.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.lessonNo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEdit = (row: AttendanceRow) => {
    setEditingRow(row.rowIndex);
    setEditValue(row.lessonDetails);
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValue("");
  };

  const saveEdit = async (rowIndex: number) => {
    setIsSaving(true);
    try {
      await onUpdate(rowIndex, editValue);
      setEditingRow(null);
      setEditValue("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNoteClick = useCallback((tab: string, rowIndex: number, note: string) => {
    markNoteRead(tab, rowIndex, note);
    setReadNotes(prev => ({ ...prev, [getNoteKey(tab, rowIndex, note)]: true }));
  }, []);

  const currentRow = rows.find(r => r.rowIndex === editingRow);
  const hasDropdown = currentRow?.dropdownOptions && currentRow.dropdownOptions.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Lesson Tracker</h2>
          <p className="text-sm text-muted-foreground">Update lesson details for your students</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoadingRows || isLoadingTabs}
            data-testid="button-refresh-attendance"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingRows || isLoadingTabs ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Student</label>
          <Select value={selectedTab} onValueChange={onSelectTab} disabled={isLoadingTabs}>
            <SelectTrigger data-testid="select-student-tab">
              <SelectValue placeholder={isLoadingTabs ? "Loading students..." : "Select a student"} />
            </SelectTrigger>
            <SelectContent>
              {tabs.map((tab) => (
                <SelectItem key={tab.sheetId} value={tab.name}>
                  {tab.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedTab && (
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by date or lesson..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-attendance"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-muted-foreground">Editable:</span>
        <Badge variant="outline" className="gap-1">
          <Edit2 className="h-3 w-3" />
          Lesson Details
        </Badge>
        <span className="text-muted-foreground">Read-only:</span>
        <Badge variant="secondary" className="gap-1">
          <Lock className="h-3 w-3" />
          All other columns
        </Badge>
      </div>

      {!selectedTab ? (
        <EmptyState
          icon={Users}
          title="Select a Student"
          description="Choose a student from the dropdown to view and update their lesson records."
        />
      ) : isLoadingRows ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No Lesson Records"
          description={searchQuery ? "No records match your search." : "No lesson records found for this student."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[60px]">No.</TableHead>
                    <TableHead className="min-w-[100px]">Date</TableHead>
                    <TableHead className="min-w-[200px]">
                      <div className="flex items-center gap-1">
                        Lesson Details
                        <Edit2 className="h-3 w-3 text-primary" />
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Teacher
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Time Purchased
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Duration
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Remaining
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[50px]">
                      <div className="flex items-center gap-1">
                        <Lock className="h-3 w-3 text-muted-foreground" />
                        Notes
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const hasNote = !!row.notes?.trim();
                    const noteKey = getNoteKey(selectedTab, row.rowIndex, row.notes);
                    const noteIsRead = hasNote && (isNoteRead(selectedTab, row.rowIndex, row.notes) || readNotes[noteKey]);
                    const isUnread = hasNote && !noteIsRead;

                    return (
                      <TableRow key={row.rowIndex} data-testid={`row-attendance-${row.rowIndex}`}>
                        <TableCell className="font-medium">{row.lessonNo}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>
                          {editingRow === row.rowIndex ? (
                            row.dropdownOptions && row.dropdownOptions.length > 0 ? (
                              <Select
                                value={editValue}
                                onValueChange={setEditValue}
                              >
                                <SelectTrigger className="w-full" data-testid="select-lesson-details">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {row.dropdownOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder="Enter lesson details..."
                                className="min-w-[180px]"
                                data-testid="input-lesson-details"
                              />
                            )
                          ) : (
                            <span className={`text-sm ${row.lessonDetails ? "" : "text-muted-foreground"}`}>
                              {row.lessonDetails || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.teacher || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.lessonTimePurchased || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.lessonDuration || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{row.remainingTime || "—"}</TableCell>
                        <TableCell>
                          {hasNote ? (
                            <Popover onOpenChange={(open) => {
                              if (open) handleNoteClick(selectedTab, row.rowIndex, row.notes);
                            }}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="relative h-8 w-8"
                                  data-testid={`button-note-${row.rowIndex}`}
                                >
                                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                                  {isUnread && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white" data-testid={`badge-unread-note-${row.rowIndex}`}>
                                      !
                                    </span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent side="left" className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium text-muted-foreground">Note</p>
                                  <p className="text-sm whitespace-pre-wrap" data-testid={`text-note-${row.rowIndex}`}>{row.notes}</p>
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingRow === row.rowIndex ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => saveEdit(row.rowIndex)}
                                disabled={isSaving}
                                data-testid="button-save-lesson"
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
