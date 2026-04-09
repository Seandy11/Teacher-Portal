import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { AlertTriangle, CheckCircle, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface StudentWithBalance {
  id: string;
  name: string;
  teacherName: string;
  isArc: boolean;
  isActive: boolean;
  totalPurchased: number;
  totalUsed: number;
  remaining: number;
  lastLessonDate: string | null;
}

function formatMinutes(minutes: number) {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${h}h ${m}m`;
}

export function LowBalanceAlerts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [threshold, setThreshold] = useState(120); // 2 hours default
  const [contactNotes, setContactNotes] = useState("");
  const [contactingStudentId, setContactingStudentId] = useState<string | null>(null);

  const { data: allStudents = [], isLoading } = useQuery<StudentWithBalance[]>({
    queryKey: ["/api/admin/student-tracker"],
  });

  const logContactMutation = useMutation({
    mutationFn: ({ studentId, notes }: { studentId: string; notes: string }) =>
      apiRequest("POST", `/api/admin/students/${studentId}/contacts`, { notes }),
    onSuccess: () => {
      toast({ title: "Contact logged", description: "Follow-up has been recorded." });
      setContactingStudentId(null);
      setContactNotes("");
    },
    onError: () => toast({ title: "Error", description: "Failed to log contact.", variant: "destructive" }),
  });

  const lowBalanceStudents = allStudents.filter(
    s => !s.isArc && s.isActive && s.remaining <= threshold
  ).sort((a, b) => a.remaining - b.remaining);

  const contactingStudent = allStudents.find(s => s.id === contactingStudentId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Low Balance Alerts</h1>
        <p className="text-muted-foreground">Students running low on lesson time who need to top up</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Alert Threshold</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Show students with less than</Label>
            <Input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-24"
            />
            <Label className="text-sm text-muted-foreground">minutes remaining</Label>
            <span className="text-sm text-muted-foreground">({formatMinutes(threshold)})</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-base">{lowBalanceStudents.length} student{lowBalanceStudents.length !== 1 ? "s" : ""} need attention</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8"><LoadingSpinner /></div>
          ) : lowBalanceStudents.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="All students have sufficient balance"
              description={`No students are below the ${formatMinutes(threshold)} threshold.`}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Last Lesson</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowBalanceStudents.map((student) => {
                  const isNegative = student.remaining < 0;
                  const isVeryLow = student.remaining < 60;
                  return (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.teacherName}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${isNegative ? "text-red-600" : isVeryLow ? "text-orange-600" : "text-yellow-600"}`}>
                          {formatMinutes(student.remaining)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {student.lastLessonDate ? new Date(student.lastLessonDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {isNegative ? (
                          <Badge variant="destructive">Overdrawn</Badge>
                        ) : isVeryLow ? (
                          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Critical</Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Low</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setContactingStudentId(student.id)}
                        >
                          <Phone className="h-3.5 w-3.5 mr-1" />
                          Log Contact
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log contact dialog */}
      <Dialog open={!!contactingStudentId} onOpenChange={(o) => !o && setContactingStudentId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Contact — {contactingStudent?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Notes (optional)</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Left voicemail, will follow up Friday"
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactingStudentId(null)}>Cancel</Button>
            <Button
              disabled={logContactMutation.isPending}
              onClick={() => contactingStudentId && logContactMutation.mutate({ studentId: contactingStudentId, notes: contactNotes })}
            >
              {logContactMutation.isPending ? <LoadingSpinner /> : "Log Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
