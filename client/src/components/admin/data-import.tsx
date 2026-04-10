import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/loading-spinner";
import { AlertTriangle, CheckCircle, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ImportSummary {
  dryRun: boolean;
  teachersScanned: number;
  studentsFound: number;
  studentsCreated: number;
  packagesImported: number;
  lessonsImported: number;
  errors: string[];
  preview: { teacherName: string; studentName: string; packages: number; lessons: number }[];
}

export function DataImport() {
  const { toast } = useToast();
  const [clearExisting, setClearExisting] = useState(false);
  const [previewResult, setPreviewResult] = useState<ImportSummary | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  const previewMutation = useMutation<ImportSummary>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/import-from-sheets", { dryRun: true, clearExisting: false });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data);
    },
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err?.message || "Could not read Google Sheets.", variant: "destructive" });
    },
  });

  const importMutation = useMutation<ImportSummary>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/import-from-sheets", { dryRun: false, clearExisting });
      return res.json();
    },
    onSuccess: (data) => {
      setImportResult(data);
      setPreviewResult(null);
      toast({ title: "Import complete", description: `${data.studentsCreated} students, ${data.packagesImported} top-ups, ${data.lessonsImported} lessons imported.` });
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err?.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const isRunning = previewMutation.isPending || importMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">Import Data from Google Sheets</h1>
        <p className="text-muted-foreground">
          Pull existing student records, top-up history, and lesson history from Google Sheets into the database.
          Run a preview first to see what will be imported.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>How this works:</strong> Each sheet tab (excluding ARC tabs) becomes a student.
          Rows with a value in column E are imported as top-up packages. Rows with a value in column F
          are imported as historical lessons (linked to that student so their balance is correct).
          After importing, do <strong>not</strong> run a full historical calendar sync — that would
          double-count lessons already imported here.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="clear"
              checked={clearExisting}
              onCheckedChange={(v) => setClearExisting(!!v)}
            />
            <Label htmlFor="clear" className="text-sm">
              Clear all previously imported data before re-importing
              <span className="block text-muted-foreground text-xs mt-0.5">
                Use this to re-run the import from scratch. Only removes records flagged as "imported from sheet".
              </span>
            </Label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => { setPreviewResult(null); setImportResult(null); previewMutation.mutate(); }}
              disabled={isRunning}
            >
              {previewMutation.isPending ? <LoadingSpinner /> : <Eye className="h-4 w-4 mr-2" />}
              Preview Import
            </Button>

            <Button
              onClick={() => importMutation.mutate()}
              disabled={isRunning || !previewResult}
            >
              {importMutation.isPending ? <LoadingSpinner /> : <Download className="h-4 w-4 mr-2" />}
              Run Import
            </Button>
          </div>
          {!previewResult && !importResult && (
            <p className="text-xs text-muted-foreground">Preview first to see what will be imported before running.</p>
          )}
        </CardContent>
      </Card>

      {/* Preview results */}
      {previewResult && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Eye className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">Preview — {previewResult.studentsFound} students across {previewResult.teachersScanned} teacher sheet{previewResult.teachersScanned !== 1 ? "s" : ""}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {previewResult.errors.length > 0 && (
              <div className="px-6 pb-2 space-y-1">
                {previewResult.errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Top-up packages</TableHead>
                  <TableHead>Lessons</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewResult.preview.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.studentName}</TableCell>
                    <TableCell className="text-muted-foreground">{row.teacherName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.packages}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.lessons}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="px-6 py-4 border-t flex gap-6 text-sm text-muted-foreground">
              <span><strong className="text-foreground">{previewResult.packagesImported}</strong> total packages</span>
              <span><strong className="text-foreground">{previewResult.lessonsImported}</strong> total lessons</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import results */}
      {importResult && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <CardTitle className="text-base">Import Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Students created", value: importResult.studentsCreated },
                { label: "Top-up packages", value: importResult.packagesImported },
                { label: "Lessons", value: importResult.lessonsImported },
                { label: "Errors", value: importResult.errors.length },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-semibold">{value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{label}</div>
                </div>
              ))}
            </div>
            {importResult.errors.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-sm font-medium">Errors:</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-sm text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground pt-2">
              Students are now visible in the Students tab. Their balances are calculated from the imported top-up packages minus lesson durations.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
