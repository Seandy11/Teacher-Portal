import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { LoadingSpinner } from "@/components/loading-spinner";
import { RoleBadge } from "@/components/role-badge";
import { Users, Plus, Edit2, Power, Search, Calendar, FileSpreadsheet, RefreshCw, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Teacher } from "@shared/schema";

interface GoogleCalendar {
  id: string;
  name: string;
  description: string;
  primary: boolean;
  backgroundColor: string;
}

const teacherFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.enum(["teacher", "admin"]),
  hourlyRate: z.string().optional(),
  calendarId: z.string().optional(),
  sheetId: z.string().optional(),
  sheetRowStart: z.string().optional(),
});

type TeacherFormValues = z.infer<typeof teacherFormSchema>;

interface TeacherManagementProps {
  teachers: Teacher[];
  isLoading: boolean;
  onAdd: (data: TeacherFormValues) => Promise<void>;
  onUpdate: (id: string, data: Partial<TeacherFormValues>) => Promise<void>;
  onToggleActive: (id: string, isActive: boolean) => Promise<void>;
}

export function TeacherManagement({ teachers, isLoading, onAdd, onUpdate, onToggleActive }: TeacherManagementProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Teacher | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: calendars = [], isLoading: calendarsLoading, refetch: refetchCalendars } = useQuery<GoogleCalendar[]>({
    queryKey: ["/api/admin/calendars"],
  });

  const calendarMap = new Map(calendars.map(c => [c.id, c.name]));

  const filteredTeachers = teachers.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addForm = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "teacher",
      hourlyRate: "",
      calendarId: "none",
      sheetId: "",
      sheetRowStart: "",
    },
  });

  const editForm = useForm<TeacherFormValues>({
    resolver: zodResolver(teacherFormSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "teacher",
      hourlyRate: "",
      calendarId: "none",
      sheetId: "",
      sheetRowStart: "",
    },
  });

  const normalizeFormData = (data: TeacherFormValues): TeacherFormValues => ({
    ...data,
    calendarId: data.calendarId === "none" || data.calendarId === "" ? undefined : data.calendarId,
  });

  const handleAdd = async (data: TeacherFormValues) => {
    setIsSubmitting(true);
    try {
      await onAdd(normalizeFormData(data));
      setIsAddOpen(false);
      addForm.reset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (data: TeacherFormValues) => {
    if (!editingTeacher) return;
    setIsSubmitting(true);
    try {
      await onUpdate(editingTeacher.id, normalizeFormData(data));
      setEditingTeacher(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async () => {
    if (!toggleTarget) return;
    setIsSubmitting(true);
    try {
      await onToggleActive(toggleTarget.id, !toggleTarget.isActive);
      setToggleTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (teacher: Teacher) => {
    editForm.reset({
      email: teacher.email,
      name: teacher.name,
      role: teacher.role,
      hourlyRate: teacher.hourlyRate || "",
      calendarId: teacher.calendarId || "none",
      sheetId: teacher.sheetId || "",
      sheetRowStart: teacher.sheetRowStart || "",
    });
    setEditingTeacher(teacher);
  };

  const handleImpersonate = async (teacher: Teacher) => {
    try {
      await apiRequest("POST", `/api/admin/impersonate/${teacher.id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonate/status"] });
      toast({
        title: "Viewing as Teacher",
        description: `You are now viewing the app as ${teacher.name}`,
      });
      setLocation("/");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start impersonation",
        variant: "destructive",
      });
    }
  };

  const TeacherFormContent = ({ form, onSubmit, submitLabel }: { form: any; onSubmit: (data: TeacherFormValues) => void; submitLabel: string }) => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} data-testid="input-teacher-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="teacher@school.com" {...field} data-testid="input-teacher-email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-teacher-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="hourlyRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Hourly Rate</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  placeholder="25.00" 
                  {...field} 
                  data-testid="input-hourly-rate" 
                />
              </FormControl>
              <FormDescription>
                Teacher's pay rate per hour for payroll calculation
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="calendarId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Google Calendar</FormLabel>
              <div className="flex items-center gap-2">
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-calendar-id" className="flex-1">
                      <SelectValue placeholder={calendarsLoading ? "Loading calendars..." : "Select a calendar"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No calendar</SelectItem>
                    {calendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cal.backgroundColor }}
                          />
                          {cal.name}{cal.primary ? " (Primary)" : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => refetchCalendars()}
                  disabled={calendarsLoading}
                  data-testid="button-refresh-calendars"
                >
                  <RefreshCw className={`h-4 w-4 ${calendarsLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <FormDescription>
                Select the Google Calendar containing this teacher's classes
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sheetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Google Sheet ID</FormLabel>
              <FormControl>
                <Input placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" {...field} data-testid="input-sheet-id" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sheetRowStart"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sheet Row Range (e.g., A2:F100)</FormLabel>
              <FormControl>
                <Input placeholder="A2:F100" {...field} data-testid="input-sheet-row" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isSubmitting} data-testid="button-save-teacher">
            {isSubmitting ? <LoadingSpinner size="sm" /> : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">Teacher Management</h2>
          <p className="text-sm text-muted-foreground">Add, edit, and manage teacher access</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teachers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
              data-testid="input-search-teachers"
            />
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-teacher">
                <Plus className="h-4 w-4" />
                Add Teacher
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Teacher</DialogTitle>
                <DialogDescription>Create a new teacher account and assign their calendar and sheet.</DialogDescription>
              </DialogHeader>
              <TeacherFormContent form={addForm} onSubmit={handleAdd} submitLabel="Add Teacher" />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredTeachers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Teachers"
          description={searchQuery ? "No teachers match your search." : "No teachers have been added yet. Click 'Add Teacher' to get started."}
          action={
            !searchQuery && (
              <Button className="gap-2" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add First Teacher
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Hourly Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Calendar
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <FileSpreadsheet className="h-3 w-3" />
                        Sheet
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeachers.map((teacher) => (
                    <TableRow key={teacher.id} data-testid={`row-teacher-${teacher.id}`}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell className="text-muted-foreground">{teacher.email}</TableCell>
                      <TableCell>
                        <RoleBadge role={teacher.role} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {teacher.hourlyRate ? `R${parseFloat(teacher.hourlyRate).toFixed(2)}/hr` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={teacher.isActive ? "default" : "secondary"}>
                          {teacher.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={teacher.calendarId || ""}>
                        {teacher.calendarId ? (calendarMap.get(teacher.calendarId) || teacher.calendarId) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                        {teacher.sheetId || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleImpersonate(teacher)}
                            title={`View as ${teacher.name}`}
                            data-testid={`button-impersonate-teacher-${teacher.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(teacher)}
                            data-testid={`button-edit-teacher-${teacher.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToggleTarget(teacher)}
                            className={teacher.isActive ? "text-destructive" : "text-green-600"}
                            data-testid={`button-toggle-teacher-${teacher.id}`}
                          >
                            <Power className="h-4 w-4" />
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

      <Dialog open={!!editingTeacher} onOpenChange={() => setEditingTeacher(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
            <DialogDescription>Update teacher information and assignments.</DialogDescription>
          </DialogHeader>
          <TeacherFormContent form={editForm} onSubmit={handleEdit} submitLabel="Save Changes" />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggleTarget} onOpenChange={() => setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? "Deactivate Teacher?" : "Activate Teacher?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.isActive
                ? `${toggleTarget.name} will no longer be able to log in or access the portal.`
                : `${toggleTarget?.name} will be able to log in and access the portal again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting} data-testid="button-cancel-toggle">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggle}
              disabled={isSubmitting}
              className={toggleTarget?.isActive ? "bg-destructive hover:bg-destructive/90" : ""}
              data-testid="button-confirm-toggle"
            >
              {isSubmitting ? <LoadingSpinner size="sm" /> : toggleTarget?.isActive ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
