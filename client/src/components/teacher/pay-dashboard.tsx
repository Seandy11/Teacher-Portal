import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ErrorDisplay } from "@/components/error-display";
import { DollarSign, Clock, Gift, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { format, subMonths, addMonths } from "date-fns";

interface PaySummary {
  month: string;
  teacherId: string;
  teacherName: string;
  hourlyRate: number;
  totalMinutes: number;
  hoursWorked: number;
  basePay: number;
  bonuses: Array<{
    id: string;
    amount: number;
    reason: string;
    createdAt: string | null;
  }>;
  totalBonuses: number;
  totalPay: number;
}

interface PayDashboardProps {
  className?: string;
}

export function PayDashboard({ className }: PayDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

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
    setSelectedMonth(prevDate.toISOString().slice(0, 7));
  };

  const goToNextMonth = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const nextDate = addMonths(new Date(year, month - 1, 1), 1);
    const now = new Date();
    if (nextDate <= now) {
      setSelectedMonth(nextDate.toISOString().slice(0, 7));
    }
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(new Date().toISOString().slice(0, 7));
  };

  const isCurrentMonth = selectedMonth === new Date().toISOString().slice(0, 7);
  const canGoNext = !isCurrentMonth;

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: date.toISOString().slice(0, 7),
        label: format(date, "MMMM yyyy"),
      });
    }
    return options;
  };

  const monthOptions = generateMonthOptions();
  const displayMonth = format(new Date(selectedMonth + "-01"), "MMMM yyyy");

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
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${paySummary.totalPay.toFixed(2)}</div>
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
                <div className="text-2xl font-bold">${paySummary.basePay.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  @ ${paySummary.hourlyRate.toFixed(2)}/hr
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-bonuses">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bonuses</CardTitle>
                <Gift className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${paySummary.totalBonuses.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {paySummary.bonuses.length} bonus{paySummary.bonuses.length !== 1 ? "es" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

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
                    <span>${paySummary.hourlyRate.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium pt-2 border-t">
                    <span>Base pay</span>
                    <span>${paySummary.basePay.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {paySummary.bonuses.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Bonuses</h4>
                  <div className="space-y-2">
                    {paySummary.bonuses.map((bonus) => (
                      <div 
                        key={bonus.id} 
                        className="p-4 border rounded-lg flex justify-between items-center"
                        data-testid={`pay-bonus-${bonus.id}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{bonus.reason}</p>
                          {bonus.createdAt && (
                            <p className="text-xs text-muted-foreground">
                              Added {format(new Date(bonus.createdAt), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                        <span className="font-medium text-primary">+${bonus.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-medium">Total for {displayMonth}</span>
                  <span className="text-2xl font-bold text-primary">${paySummary.totalPay.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
