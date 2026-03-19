"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DigitalProduct {
  id: string;
  name: string;
  description: string | null;
  aiDescription: string | null;
  productType: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  coverImageUrl: string | null;
  fileUrl: string | null;
  previewImages: string[];
  tags: string[];
  aiTags: string[];
  isPublished: boolean;
  salesCount: number;
  totalRevenue: number;
  createdAt: string;
  _count?: { orders: number };
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => api<DigitalProduct[]>("/v1/products"),
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => api<DigitalProduct & { orders: any[] }>(`/v1/products/${id}`),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      productType: string;
      price: number;
      compareAtPrice?: number;
      tags?: string[];
    }) => api<DigitalProduct>("/v1/products", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DigitalProduct> }) =>
      api<DigitalProduct>(`/v1/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/v1/products/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useAiRegenerateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<DigitalProduct>(`/v1/products/${id}/ai-regenerate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
