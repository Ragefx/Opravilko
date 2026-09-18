import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { AppData, FilterDef, Label, Project, Section, Task } from "./types";

const BOOTSTRAP_KEY = ["bootstrap"];

export function useBootstrap() {
  return useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: () => api.get<AppData>("/api/bootstrap"),
  });
}

function useOptimistic() {
  const qc = useQueryClient();
  return {
    qc,
    update(updater: (data: AppData) => AppData) {
      qc.setQueryData<AppData>(BOOTSTRAP_KEY, (old) => (old ? updater(old) : old));
    },
    invalidate() {
      qc.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
    },
  };
}

// ---- tasks ----
export function useCreateTask() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (payload: Partial<Task> & { content: string }) => api.post<Task>("/api/tasks", payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<Task> & { id: string }) =>
      api.patch<Task>(`/api/tasks/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function useCompleteTask() {
  const { update, invalidate } = useOptimistic();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.post<Task>(`/api/tasks/${id}/${completed ? "complete" : "uncomplete"}`),
    onMutate: ({ id, completed }) => {
      update((data) => ({
        ...data,
        tasks: data.tasks.map((t) =>
          t.id === id ? { ...t, completed, completedAt: completed ? new Date().toISOString() : null } : t
        ),
      }));
    },
    onSettled: invalidate,
  });
}

export function useDeleteTask() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/tasks/${id}`),
    onSuccess: invalidate,
  });
}

// ---- projects ----
export function useCreateProject() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (payload: Partial<Project> & { name: string }) => api.post<Project>("/api/projects", payload),
    onSuccess: invalidate,
  });
}

export function useUpdateProject() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<Project> & { id: string }) =>
      api.patch<Project>(`/api/projects/${id}`, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteProject() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: invalidate,
  });
}

// ---- sections ----
export function useCreateSection() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (payload: Partial<Section> & { name: string; projectId: string }) =>
      api.post<Section>("/api/sections", payload),
    onSuccess: invalidate,
  });
}

// ---- labels ----
export function useCreateLabel() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (payload: Partial<Label> & { name: string }) => api.post<Label>("/api/labels", payload),
    onSuccess: invalidate,
  });
}

export function useDeleteLabel() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/labels/${id}`),
    onSuccess: invalidate,
  });
}

// ---- filters ----
export function useCreateFilter() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (payload: Partial<FilterDef> & { name: string; query: string }) =>
      api.post<FilterDef>("/api/filters", payload),
    onSuccess: invalidate,
  });
}

export function useDeleteFilter() {
  const { invalidate } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/filters/${id}`),
    onSuccess: invalidate,
  });
}
