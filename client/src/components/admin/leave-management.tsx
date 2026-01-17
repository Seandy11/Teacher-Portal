import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { StatusBadge } from "@/components/status-badge";
import { FileText, Search, Check, X, Eye } from "lucide-react";
import { format } from "date-fns";
import type { LeaveRequest, Teacher } from "@shared/schema";

interface LeaveManagementProps {
  requests: (LeaveRequest & { teacher?: Teacher })[];
  isLoading: boolean;
  onUpdateStatus: (id: string, status: "approved" | "rejected", notes?: string) => Promise<void>;
}

export function LeaveManagement({ requests, isLoading, onUpdateStatus }: LeaveManagementProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingRequest, setViewingRequest] = useState<(LeaveRequest & { teacher?: Teacher }) | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const filteredRequests = requests.filter(r =>
    r.teacher?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.leaveType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStatusUpdate = async (status: "approved" | "rejected") => {
    if (!viewingRequest) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(viewingRequest.id, status, adminNotes);
      setViewingRequest(null);
      setAdminNotes("");
    } finally {
      setIsUpdating(false);
    }
  };

  const openRequest = (request: LeaveRequest & { teacher?: Teacher }) => {
    setViewingRequest(request);
    setAdminNotes(request.adminNotes || "");
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium flex items-center gap-2">
            Leave Requests
            {pendingCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">Review and manage teacher leave requests</p>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
            data-testid="input-search-leave"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Leave Requests"
          description={searchQuery ? "No requests match your search." : "No leave requests have been submitted yet."}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id} data-testid={`row-leave-admin-${request.id}`}>
                      <TableCell className="font-medium">{request.teacher?.name || "Unknown"}</TableCell>
                      <TableCell>
                        {request.startDate} — {request.endDate}
                      </TableCell>
                      <TableCell className="capitalize">{request.leaveType}</TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {request.createdAt ? format(new Date(request.createdAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openRequest(request)}
                          data-testid={`button-view-leave-${request.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!viewingRequest} onOpenChange={() => setViewingRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>Review the request and update its status</DialogDescription>
          </DialogHeader>
          
          {viewingRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Teacher</span>
                  <p className="font-medium">{viewingRequest.teacher?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium capitalize">{viewingRequest.leaveType}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Start Date</span>
                  <p className="font-medium">{viewingRequest.startDate}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">End Date</span>
                  <p className="font-medium">{viewingRequest.endDate}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Current Status</span>
                  <div className="mt-1">
                    <StatusBadge status={viewingRequest.status} />
                  </div>
                </div>
                {viewingRequest.reason && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Reason</span>
                    <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{viewingRequest.reason}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Admin Notes (optional)</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this decision..."
                  rows={3}
                  data-testid="input-admin-notes"
                />
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => setViewingRequest(null)}
                  disabled={isUpdating}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleStatusUpdate("rejected")}
                  disabled={isUpdating || viewingRequest.status === "rejected"}
                  className="gap-2"
                  data-testid="button-reject-leave"
                >
                  {isUpdating ? <LoadingSpinner size="sm" /> : <X className="h-4 w-4" />}
                  Reject
                </Button>
                <Button
                  onClick={() => handleStatusUpdate("approved")}
                  disabled={isUpdating || viewingRequest.status === "approved"}
                  className="gap-2"
                  data-testid="button-approve-leave"
                >
                  {isUpdating ? <LoadingSpinner size="sm" /> : <Check className="h-4 w-4" />}
                  Approve
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
