"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Video,
  Calendar,
  Bot,
  Users,
  Handshake,
  BarChart3,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { label: "總覽", href: "/", icon: LayoutDashboard },
  { label: "影片管理", href: "/videos", icon: Video },
  { label: "排程管理", href: "/schedule", icon: Calendar },
  { label: "Bot 設定", href: "/bot", icon: Bot },
  { label: "會員管理", href: "/members", icon: Users },
  { label: "品牌合作", href: "/brand", icon: Handshake },
  { label: "數據分析", href: "/analytics", icon: BarChart3 },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="text-lg font-bold">
            Creator Platform
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1">
        <header className="flex h-16 items-center border-b px-6">
          <h2 className="text-lg font-semibold">儀表板</h2>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
