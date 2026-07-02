import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  PermissionCatalog,
  Permission,
  Report,
  ReportDetail,
  Role,
  Share,
  Slide,
  User,
} from "./types";

// --------------------------------------------------------------------------- //
// Reports
// --------------------------------------------------------------------------- //
export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: async () => (await api.get<Report[]>("/reports")).data,
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ["reports", id],
    queryFn: async () => (await api.get<ReportDetail>(`/reports/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title: string; description?: string }) =>
      (await api.post<Report>("/reports", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

export function useUpdateReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { title?: string; description?: string }) =>
      (await api.patch<Report>(`/reports/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["reports", id] });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });
}

// --------------------------------------------------------------------------- //
// Slides
// --------------------------------------------------------------------------- //
export function useDeleteSlide(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slideId: string) => api.delete(`/slides/${slideId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", reportId] }),
  });
}

export function useSlide(id: string) {
  return useQuery({
    queryKey: ["slides", id],
    queryFn: async () => (await api.get<Slide>(`/slides/${id}`)).data,
    enabled: !!id,
  });
}

// --------------------------------------------------------------------------- //
// Users
// --------------------------------------------------------------------------- //
export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      email: string;
      name?: string;
      role: Role;
      permissions?: Permission[];
    }) => (await api.post<User>("/users", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<User> }) =>
      (await api.patch<User>(`/users/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["permission-catalog"],
    queryFn: async () =>
      (await api.get<PermissionCatalog>("/permissions/catalog")).data,
    staleTime: Infinity,
  });
}

// --------------------------------------------------------------------------- //
// Shares
// --------------------------------------------------------------------------- //
export function useShares(slideId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["shares", slideId],
    queryFn: async () => (await api.get<Share[]>(`/slides/${slideId}/shares`)).data,
    enabled: enabled && !!slideId,
  });
}

export function useCreateShare(slideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { expires_in_hours?: number | null }) =>
      (await api.post<Share>(`/slides/${slideId}/shares`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares", slideId] }),
  });
}

export function useRevokeShare(slideId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (shareId: string) => api.delete(`/shares/${shareId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares", slideId] }),
  });
}
