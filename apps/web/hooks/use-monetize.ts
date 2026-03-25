"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ChannelHealth {
  revenue: number;
  percentage: number;
  [key: string]: unknown;
}

export interface HealthReport {
  period: { start: string; end: string };
  totalRevenue: number;
  previousTotalRevenue: number;
  growthRate: number;
  channels: {
    membership: ChannelHealth & { mrr: number; activeMembers: number; churnRate: number; avgRevenuePerMember: number };
    digitalProduct: ChannelHealth & { totalSales: number; avgOrderValue: number; topProduct: { name: string; sales: number } | null };
    brandDeal: ChannelHealth & { activeDeals: number; avgDealValue: number; conversionRate: number };
    affiliate: ChannelHealth & { totalClicks: number; conversionRate: number; topLink: { name: string; revenue: number } | null };
    subscription: ChannelHealth & { plan: string };
  };
}

export interface AdviceReport {
  suggestions: {
    id: string;
    title: string;
    description: string;
    impact: string;
    category: string;
    steps: string[];
    estimatedImpact: string;
  }[];
  pricingAdvice: Record<string, unknown>;
  unusedChannels: {
    channel: string;
    reason: string;
    estimatedMonthlyRevenue: string;
    setupDifficulty: string;
    prerequisites: string[];
  }[];
  generatedAt: string;
}

export interface ForecastReport {
  hasEnoughData: boolean;
  forecast: {
    month1: { total: number; low: number; high: number };
    month2: { total: number; low: number; high: number };
    month3: { total: number; low: number; high: number };
  } | null;
  assumptions: string[];
  generatedAt: string;
}

export function useHealth(period: string = "30d") {
  return useQuery({
    queryKey: ["monetize", "health", period],
    queryFn: () => api<HealthReport>(`/v1/monetize/health?period=${period}`),
  });
}

export function useAdvice() {
  return useQuery({
    queryKey: ["monetize", "advice"],
    queryFn: () => api<AdviceReport>("/v1/monetize/advice"),
    enabled: false, // manual trigger
  });
}

export function useForecast() {
  return useQuery({
    queryKey: ["monetize", "forecast"],
    queryFn: () => api<ForecastReport>("/v1/monetize/forecast"),
  });
}
