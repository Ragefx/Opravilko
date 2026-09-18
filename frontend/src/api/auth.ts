import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ authenticated: boolean }>("/api/auth/me"),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.post<{ ok: boolean }>("/api/auth/login", { password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/api/auth/logout"),
    onSuccess: () => qc.invalidateQueries(),
  });
}
