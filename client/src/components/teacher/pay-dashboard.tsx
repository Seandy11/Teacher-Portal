import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { Wallet, Clock, Gift, TrendingUp, ChevronLeft, ChevronRight, Award, GraduationCap, Users, UserPlus, Presentation, ChevronDown, ChevronUp, AlertCircle, ListChecks } from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";
import { formatMonthLocal, getCurrentMonthLocal } from "@/lib/date-utils";

interface BonusBreakdown {
  assessment: number;
  training: number;
  referral: number;
  retention: number;
  demo: number;
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

interface BonusRow {
  sheetName: string;
  year: number;
  month: number;
  assessment: number;
  training: number;
  referral: number;
  retention: number;
  demo: number;
  notes: string;
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
  bonusRows?: BonusRow[];
}

interface PayDashboardProps {
  className?: string;
}

export function PayDashboard({ className }: PayDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthLocal());
  const [showEventBreakdown, setShowEventBreakdown] = useState(false);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  const { data: paySummary, isLoading, error, refetch } = useQuery<PaySummary>({
    queryKey: ["/api/pay/summary", selectedMonth],
    queryFn: async () => {
      const response = await fetch(`/api/pay/summary?month=${selectedMonth}`);
      if (!response.ok) throw new Error("Failed to fetch pay summary");
      return response.json();
    },
  });

  const goToPreviousMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const prevDate = subMonths(new Date(year, month - 1, 1), 1);
    setSelectedMonth(formatMonthLocal(prevDate));
  };

  const goToNextMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const nextDate = addMonths(new Date(year, month - 1, 1), 1);
    const now = new Date();
    if (nextDate <= now) {
      setSelectedMonth(formatMonthLocal(nextDate));
    }
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(getCurrentMonthLocal());
  };

  const isCurrentMonth = selectedMonth === getCurrentMonthLocal();
  const canGoNext = !isCurrentMonth;

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
  const displayMonth = format(new Date(selectedMonth + "-01"), "MMMM yyyy");

  const bonusItems = paySummary ? [
    { key: "assessment", label: "Assessment", amount: paySummary.bonuses.assessment, icon: Award },
    { key: "training", label: "Training", amount: paySummary.bonuses.training, icon: GraduationCap },
    { key: "referral", label: "Referral", amount: paySummary.bonuses.referral, icon: UserPlus },
    { key: "retention", label: "Retention", amount: paySummary.bonuses.retention, icon: Users },
    { key: "demo", label: "Demo", amount: paySummary.bonuses.demo, icon: Presentation },
  ].filter(item => item.amount > 0) : [];

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load pay summary"
        message="Could not fetch your pay information. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium">My Pay</h2>
          <p className="text-sm text-muted-foreground">View your earnings and bonuses</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousMonth}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]" data-testid="select-pay-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            disabled={!canGoNext}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button
              variant="outline"
              onClick={goToCurrentMonth}
              data-testid="button-current-month"
            >
              Today
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : paySummary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-total-pay">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pay</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R{paySummary.totalPay.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {displayMonth}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-hours-worked">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Hours Worked</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paySummary.hoursWorked.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground">
                  {paySummary.totalMinutes} minutes total
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-base-pay">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Base Pay</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R{paySummary.basePay.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  @ R{paySummary.hourlyRate.toFixed(2)}/hr
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-bonuses">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bonuses</CardTitle>
                <Gift className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R{paySummary.bonuses.total.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {bonusItems.length} bonus type{bonusItems.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {paySummary.isCurrentMonth && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800" data-testid="current-month-notice">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This month is still in progress. Only completed lessons are included in the hours total.
              </p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pay Breakdown</CardTitle>
              <CardDescription>Detailed breakdown for {displayMonth}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Earnings from Classes</h4>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hours worked</span>
                    <span>{paySummary.hoursWorked.toFixed(2)} hours</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hourly rate</span>
                    <span>R{paySummary.hourlyRate.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium pt-2 border-t">
                    <span>Base pay</span>
                    <span>R{paySummary.basePay.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {bonusItems.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Bonuses & Adjustments</h4>
                  <div className="space-y-2">
                    {bonusItems.map((bonus) => (
                      <div 
                        key={bonus.key} 
                        className="p-4 border rounded-lg flex justify-between items-center"
                        data-testid={`pay-bonus-${bonus.key}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-full">
                            <bonus.icon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium">{bonus.label}</span>
                        </div>
                        <span className="font-medium text-green-600">+R{bonus.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="p-3 border rounded-lg flex justify-between items-center bg-muted/50">
                      <span className="text-sm font-medium">Total Bonuses</span>
                      <span className="font-medium">R{paySummary.bonuses.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {bonusItems.length === 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Bonuses & Adjustments</h4>
                  <div className="p-4 border rounded-lg text-center text-muted-foreground text-sm">
                    No bonuses for this month
                  </div>
                </div>
              )}

              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">Total for {displayMonth}</span>
                  <span className="text-2xl font-bold text-primary">R{paySummary.totalPay.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {paySummary.eventBreakdown && paySummary.eventBreakdown.counted.length > 0 && (
            <Card data-testid="card-hours-by-student">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Hours by Student</CardTitle>
                    <CardDescription>Total hours per student for easy payroll comparison</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg divide-y">
                  {(() => {
                    const extractStudentName = (title: string): string => {
                      if (!title) return "(no title)";
                      const underscoreIndex = title.lastIndexOf("_");
                      if (underscoreIndex !== -1 && underscoreIndex < title.length - 1) {
                        return title.substring(underscoreIndex + 1).trim();
                      }
                      return title.trim();
                    };

                    const grouped: Record<string, { totalMinutes: number; count: number; events: EventDetail[] }> = {};
                    for (const event of paySummary.eventBreakdown!.counted) {
                      const studentName = extractStudentName(event.title);
                      if (!grouped[studentName]) {
                        grouped[studentName] = { totalMinutes: 0, count: 0, events: [] };
                      }
                      grouped[studentName].totalMinutes += event.duration;
                      grouped[studentName].count += 1;
                      grouped[studentName].events.push(event);
                    }
                    const sorted = Object.entries(grouped).sort((a, b) => b[1].totalMinutes - a[1].totalMinutes);
                    const toggleStudent = (name: string) => {
                      setExpandedStudents(prev => {
                        const next = new Set(prev);
                        if (next.has(name)) next.delete(name);
                        else next.add(name);
                        return next;
                      });
                    };

                    return sorted.map(([name, data]) => (
                      <div key={name} data-testid={`student-hours-${name}`}>
                        <div
                          className="px-3 py-2 flex justify-between items-center text-sm cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleStudent(name)}
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
                    ));
                  })()}
                  <div className="px-3 py-2 flex justify-between items-center text-sm font-medium bg-muted/50">
                    <span>Total</span>
                    <div className="flex items-center gap-3 whitespace-nowrap ml-2">
                      <span className="text-muted-foreground text-xs">{paySummary.totalMinutes} min</span>
                      <span>{paySummary.hoursWorked.toFixed(1)} hrs</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {paySummary.eventBreakdown && (
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setShowEventBreakdown(!showEventBreakdown)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Lessons Counted</CardTitle>
                      <CardDescription>
                        {paySummary.eventBreakdown.counted.length} lesson{paySummary.eventBreakdown.counted.length !== 1 ? "s" : ""} counted
                      </CardDescription>
                    </div>
                  </div>
                  {showEventBreakdown ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
              {showEventBreakdown && (
                <CardContent className="space-y-4">
                  {paySummary.eventBreakdown.counted.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-green-700 dark:text-green-400">Counted toward hours</h4>
                      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                        {paySummary.eventBreakdown.counted.map((event, i) => (
                          <div key={i} className="px-3 py-2 flex justify-between items-center text-sm" data-testid={`counted-event-${i}`}>
                            <div>
                              <span className="font-medium">{event.title}</span>
                              <span className="text-muted-foreground ml-2">{event.date} {event.time}</span>
                            </div>
                            <span className="text-muted-foreground whitespace-nowrap ml-2">{event.duration} min</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
