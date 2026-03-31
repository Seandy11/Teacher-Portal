import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import {
  Wallet, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Users, ArrowLeft, TrendingUp, ListChecks, Gift, AlertCircle
} from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import { formatMonthLocal, getCurrentMonthLocal } from "@/lib/date-utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface BonusItem {
  id: string;
  amount: string;
  reason: string;
  month: string;
  createdAt: string | null;
}

interface BonusBreakdown {
  items: BonusItem[];
  total: number;
}

interface EventDetail {
  title: string;
  duration: number;
  date: string;
  time: string;
}

interface SkippedEvent {
  title: string;
  reason: string;
}

interface PaySummary {
  month: string;
  teacherId: string;
  teacherName: string;
  hourlyRate: number;
  totalMinutes: number;
  hoursWorked: number;
  basePay: number;
  bonuses: BonusBreakdown;
  totalPay: number;
  isCurrentMonth?: boolean;
  eventBreakdown?: {
    counted: EventDetail[];
    skipped: SkippedEvent[];
  };
  error?: string;
}

export function PayrollOverview() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthLocal());
  const [selectedTeacher, setSelectedTeacher] = useState<PaySummary | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [showCounted, setShowCounted] = useState(false);

  const { data: payrollData = [], isLoading, error, refetch } = useQuery<PaySummary[]>({
    queryKey: ["/api/admin/payroll", selectedMonth],
    queryFn: async () => {
      const response = await fetch(`/api/admin/payroll?month=${selectedMonth}`);
      if (!response.ok) throw new Error("Failed to fetch payroll data");
      return response.json();
    },
  });

  const chartMonths = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(formatMonthLocal(date));
    }
    return months;
  }, []);

  const { data: chartData } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/payroll/chart", selectedTeacher?.teacherId, chartMonths.join(",")],
    queryFn: async () => {
      if (!selectedTeacher) return {};
      const results: Record<string, number> = {};
      await Promise.all(chartMonths.map(async (m) => {
        try {
          const res = await fetch(`/api/admin/pay/${selectedTeacher.teacherId}?month=${m}`);
          if (res.ok) {
            const data = await res.json();
            results[m] = data.totalPay;
          }
        } catch {}
      }));
      return results;
    },
    enabled: !!selectedTeacher,
  });

  const goToPreviousMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    setSelectedMonth(formatMonthLocal(subMonths(new Date(year, month - 1, 1), 1)));
  };

  const goToNextMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const nextDate = addMonths(new Date(year, month - 1, 1), 1);
    if (nextDate <= new Date()) {
      setSelectedMonth(formatMonthLocal(nextDate));
    }
  };

  const isCurrentMonth = selectedMonth === getCurrentMonthLocal();
  const displayMonth = format(new Date(selectedMonth + "-01"), "MMMM yyyy");

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: formatMonthLocal(date), label: format(date, "MMMM yyyy") });
    }
    return options;
  };

  const grandTotal = payrollData.reduce((sum, t) => sum + t.totalPay, 0);
  const totalHours = payrollData.reduce((sum, t) => sum + t.hoursWorked, 0);
  const totalBasePay = payrollData.reduce((sum, t) => sum + t.basePay, 0);
  const totalBonuses = payrollData.reduce((sum, t) => sum + t.bonuses.total, 0);

  if (selectedTeacher) {
    return (
      <TeacherPayDetail
        teacher={selectedTeacher}
        displayMonth={displayMonth}
        chartData={chartData}
        chartMonths={chartMonths}
        expandedStudents={expandedStudents}
        setExpandedStudents={setExpandedStudents}
        showSkipped={showSkipped}
        setShowSkipped={setShowSkipped}
        showCounted={showCounted}
        setShowCounted={setShowCounted}
        onBack={() => {
          setSelectedTeacher(null);
          setExpandedStudents(new Set());
          setShowSkipped(false);
          setShowCounted(false);
        }}
      />
    );
  }

  if (error) {
    return <ErrorDisplay title="Failed to load payroll" message="Could not fetch payroll data." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Payroll Overview</h2>
          <p className="text-sm text-muted-foreground">Monthly pay summary for all teachers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousMonth} data-testid="button-prev-month-payroll">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]" data-testid="select-month-payroll">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {generateMonthOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={goToNextMonth} disabled={isCurrentMonth} data-testid="button-next-month-payroll">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Total Payroll
            </div>
            <div className="text-2xl font-bold" data-testid="text-grand-total">R{grandTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Total Hours
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-hours">{totalHours.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Base Pay
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-base">R{totalBasePay.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Gift className="h-4 w-4" />
              Total Bonuses
            </div>
            <div className="text-2xl font-bold" data-testid="text-total-bonuses">R{totalBonuses.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Base Pay</TableHead>
                    <TableHead className="text-right">Bonuses</TableHead>
                    <TableHead className="text-right">Total Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData.map((teacher) => (
                    <TableRow
                      key={teacher.teacherId}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedTeacher(teacher)}
                      data-testid={`row-payroll-${teacher.teacherId}`}
                    >
                      <TableCell className="font-medium">{teacher.teacherName}</TableCell>
                      <TableCell className="text-right">{teacher.hoursWorked.toFixed(1)}</TableCell>
                      <TableCell className="text-right">R{teacher.hourlyRate.toFixed(0)}</TableCell>
                      <TableCell className="text-right">R{teacher.basePay.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {teacher.bonuses.total > 0 ? `R${teacher.bonuses.total.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold">R{teacher.totalPay.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>Total ({payrollData.length} teachers)</TableCell>
                    <TableCell className="text-right">{totalHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right"></TableCell>
                    <TableCell className="text-right">R{totalBasePay.toFixed(2)}</TableCell>
                    <TableCell className="text-right">R{totalBonuses.toFixed(2)}</TableCell>
                    <TableCell className="text-right">R{grandTotal.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeacherPayDetail({
  teacher,
  displayMonth,
  chartData,
  chartMonths,
  expandedStudents,
  setExpandedStudents,
  showSkipped,
  setShowSkipped,
  showCounted,
  setShowCounted,
  onBack,
}: {
  teacher: PaySummary;
  displayMonth: string;
  chartData?: Record<string, number>;
  chartMonths: string[];
  expandedStudents: Set<string>;
  setExpandedStudents: React.Dispatch<React.SetStateAction<Set<string>>>;
  showSkipped: boolean;
  setShowSkipped: (v: boolean) => void;
  showCounted: boolean;
  setShowCounted: (v: boolean) => void;
  onBack: () => void;
}) {
  const extractStudentName = (title: string): string => {
    if (!title) return "(no title)";
    const underscoreIndex = title.lastIndexOf("_");
    if (underscoreIndex !== -1 && underscoreIndex < title.length - 1) {
      return title.substring(underscoreIndex + 1).trim();
    }
    return title.trim();
  };

  const studentGroups = useMemo(() => {
    if (!teacher.eventBreakdown?.counted) return [];
    const grouped: Record<string, { totalMinutes: number; count: number; events: EventDetail[] }> = {};
    for (const event of teacher.eventBreakdown.counted) {
      const studentName = extractStudentName(event.title);
      if (!grouped[studentName]) grouped[studentName] = { totalMinutes: 0, count: 0, events: [] };
      grouped[studentName].totalMinutes += event.duration;
      grouped[studentName].count += 1;
      grouped[studentName].events.push(event);
    }
    return Object.entries(grouped).sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
  }, [teacher.eventBreakdown]);

  const toggleStudent = (name: string) => {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const bonusItems = teacher.bonuses.items;

  const barChartData = chartMonths.map(m => ({
    month: format(new Date(m + "-01"), "MMM"),
    pay: chartData?.[m] ?? 0,
    isCurrent: m === teacher.month,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-payroll">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-medium">{teacher.teacherName}</h2>
          <p className="text-sm text-muted-foreground">Pay breakdown for {displayMonth}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Total Pay
            </div>
            <div className="text-2xl font-bold text-primary" data-testid="text-teacher-total-pay">R{teacher.totalPay.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              Hours Worked
            </div>
            <div className="text-2xl font-bold" data-testid="text-teacher-hours">{teacher.hoursWorked.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">{teacher.totalMinutes} minutes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Base Pay
            </div>
            <div className="text-2xl font-bold" data-testid="text-teacher-base">R{teacher.basePay.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">R{teacher.hourlyRate}/hr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Gift className="h-4 w-4" />
              Bonuses
            </div>
            <div className="text-2xl font-bold" data-testid="text-teacher-bonuses">R{teacher.bonuses.total.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {bonusItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bonus Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bonusItems.map(item => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-muted-foreground" />
                    <span>{item.reason}</span>
                  </div>
                  <span className="font-medium">R{parseFloat(item.amount).toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between items-center text-sm font-medium">
                <span>Total</span>
                <span>R{teacher.bonuses.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {chartData && Object.keys(chartData).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Salary Trend</CardTitle>
            <CardDescription>Last 6 months of total pay</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 12 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 12 }} tickFormatter={(v) => `R${v}`} />
                  <RechartsTooltip
                    formatter={(value: number) => [`R${value.toFixed(2)}`, "Total Pay"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Bar dataKey="pay" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {studentGroups.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Hours by Student</CardTitle>
                <CardDescription>{studentGroups.length} student{studentGroups.length !== 1 ? "s" : ""} taught</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg divide-y">
              {studentGroups.map(([name, data]) => (
                <div key={name}>
                  <div
                    className="px-3 py-2 flex justify-between items-center text-sm cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => toggleStudent(name)}
                    data-testid={`admin-student-hours-${name}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {expandedStudents.has(name) ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{name}</span>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">({data.count} lesson{data.count !== 1 ? "s" : ""})</span>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap ml-2">
                      <span className="text-muted-foreground text-xs">{data.totalMinutes} min</span>
                      <span className="font-medium">{(data.totalMinutes / 60).toFixed(1)} hrs</span>
                    </div>
                  </div>
                  {expandedStudents.has(name) && (
                    <div className="bg-muted/20 border-t divide-y">
                      {data.events.map((event, i) => (
                        <div key={i} className="px-3 py-1.5 pl-9 flex justify-between items-center text-xs text-muted-foreground">
                          <div>
                            <span>{event.date}</span>
                            <span className="ml-2">{event.time}</span>
                          </div>
                          <span>{event.duration} min</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="px-3 py-2 flex justify-between items-center text-sm font-medium bg-muted/50">
                <span>Total</span>
                <div className="flex items-center gap-3 whitespace-nowrap ml-2">
                  <span className="text-muted-foreground text-xs">{teacher.totalMinutes} min</span>
                  <span>{teacher.hoursWorked.toFixed(1)} hrs</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {teacher.eventBreakdown && teacher.eventBreakdown.counted.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowCounted(!showCounted)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Lessons Counted</CardTitle>
                  <CardDescription>
                    {teacher.eventBreakdown.counted.length} lesson{teacher.eventBreakdown.counted.length !== 1 ? "s" : ""} counted
                  </CardDescription>
                </div>
              </div>
              {showCounted ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </div>
          </CardHeader>
          {showCounted && (
            <CardContent>
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {teacher.eventBreakdown.counted.map((event, i) => (
                  <div key={i} className="px-3 py-2 flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{event.title}</span>
                      <span className="text-muted-foreground ml-2">{event.date} {event.time}</span>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap ml-2">{event.duration} min</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {teacher.eventBreakdown && teacher.eventBreakdown.skipped.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowSkipped(!showSkipped)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Skipped Lessons</CardTitle>
                  <CardDescription>
                    {teacher.eventBreakdown.skipped.length} event{teacher.eventBreakdown.skipped.length !== 1 ? "s" : ""} not counted
                  </CardDescription>
                </div>
              </div>
              {showSkipped ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </div>
          </CardHeader>
          {showSkipped && (
            <CardContent>
              <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                {teacher.eventBreakdown.skipped.map((event, i) => (
                  <div key={i} className="px-3 py-2 flex justify-between items-center text-sm text-muted-foreground">
                    <span>{event.title || "(no title)"}</span>
                    <span className="text-xs">{event.reason}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
