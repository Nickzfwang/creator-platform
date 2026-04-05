"use client";

import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function NotificationBell() {
  const t = useTranslations("nav");
  const { data } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api<{ count: number }>("/v1/notifications/unread-count"),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const count = data?.count ?? 0;

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/notifications">
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">{t("notifications")}</span>
      </Link>
    </Button>
  );
}
