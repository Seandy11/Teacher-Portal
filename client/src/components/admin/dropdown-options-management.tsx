import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EmptyState } from "@/components/empty-state";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Plus, Trash2, ListChecks } from "lucide-react";
import type { DropdownOption } from "@shared/schema";

const SEED_OPTIONS = [
  "Regular Lesson",
  "Trial Lesson",
  "Make-up Lesson",
  "Assessment",
  "Cancelled",
  "No Show",
  "Public Holiday",
];

export function DropdownOptionsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newValue, setNewValue] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const { data: options = [], isLoading } = useQuery<DropdownOption[]>({
    queryKey: ["/api/dropdown-options"],
  });

  const createMutation = useMutation({
    mutationFn: async (value: string) => {
      return apiRequest("POST", "/api/admin/dropdown-options", {
        value,
        sortOrder: options.length,
      });
    },
    onSuccess: () => {
      toast({ title: "Option added", description: "The dropdown option has been added." });
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options"] });
      setNewValue("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add option.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/dropdown-options/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Option deleted", description: "The dropdown option has been removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete option.", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest("PATCH", "/api/admin/dropdown-options/reorder", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder options.", variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < SEED_OPTIONS.length; i++) {
        await apiRequest("POST", "/api/admin/dropdown-options", {
          value: SEED_OPTIONS[i],
          sortOrder: options.length + i,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Options seeded", description: "Common lesson detail options have been added." });
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to seed options.", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    if (options.some(o => o.value.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Duplicate", description: "This option already exists.", variant: "destructive" });
      return;
    }
    createMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const currentIds = options.map(o => o.id);
    const fromIndex = currentIds.indexOf(draggedId);
    const toIndex = currentIds.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newIds = [...currentIds];
    newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, draggedId);

    setDraggedId(null);
    setDragOverId(null);
    reorderMutation.mutate(newIds);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New Option</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter option text (e.g. Regular Lesson)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={handleKeyDown}
              data-testid="input-new-dropdown-option"
              className="flex-1"
            />
            <Button
              onClick={handleAdd}
              disabled={!newValue.trim() || createMutation.isPending}
              data-testid="button-add-dropdown-option"
            >
              {createMutation.isPending ? <LoadingSpinner size="sm" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>
          {options.length === 0 && !isLoading && (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-dropdown-options"
              >
                {seedMutation.isPending ? <LoadingSpinner size="sm" /> : null}
                Add common lesson options
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Options</CardTitle>
          <p className="text-sm text-muted-foreground">Drag to reorder. These options appear in the attendance lesson details dropdown.</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : options.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No Dropdown Options"
              description="Add options above to populate the lesson details dropdown for teachers."
            />
          ) : (
            <div className="space-y-1" data-testid="list-dropdown-options">
              {options.map((option) => (
                <div
                  key={option.id}
                  draggable
                  onDragStart={() => handleDragStart(option.id)}
                  onDragOver={(e) => handleDragOver(e, option.id)}
                  onDrop={(e) => handleDrop(e, option.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md border bg-background transition-colors cursor-grab active:cursor-grabbing ${
                    dragOverId === option.id ? "border-primary bg-primary/5" : "border-border"
                  } ${draggedId === option.id ? "opacity-50" : ""}`}
                  data-testid={`item-dropdown-option-${option.id}`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm" data-testid={`text-option-value-${option.id}`}>
                    {option.value}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(option.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-option-${option.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
