"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Video,
  Calendar,
  Bot,
  Users,
  Handshake,
  BarChart3,
  LayoutDashboard,
  LogOut,
  Settings,
  Menu,
  Bell,
  Radar,
  Bookmark,
  Globe,
  PanelTop,
  ShoppingBag,
  Mail,
  Lightbulb,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AiAssistant } from "@/components/ai-assistant";

const sidebarItems = [
  { label: "總覽", href: "/", icon: LayoutDashboard },
  { label: "影片管理", href: "/videos", icon: Video },
  { label: "排程管理", href: "/schedule", icon: Calendar },
  { label: "Bot 設定", href: "/bot", icon: Bot },
  { label: "會員管理", href: "/members", icon: Users },
  { label: "品牌合作", href: "/brand", icon: Handshake },
  { label: "內容策略", href: "/strategy", icon: Lightbulb },
  { label: "趨勢雷達", href: "/trends", icon: Radar },
  { label: "收藏庫", href: "/clips", icon: Bookmark },
  { label: "AI 社群探索", href: "/browse", icon: Globe },
  { label: "Landing Page", href: "/landing", icon: PanelTop },
  { label: "商品商店", href: "/store", icon: ShoppingBag },
  { label: "Email 行銷", href: "/email", icon: Mail },
  { label: "變現顧問", href: "/monetize", icon: DollarSign },
  { label: "數據分析", href: "/analytics", icon: BarChart3 },
  { label: "設定", href: "/settings", icon: Settings },
];

const pageTitles: Record<string, string> = {
  "/": "總覽",
  "/videos": "影片管理",
  "/schedule": "排程管理",
  "/bot": "Bot 設定",
  "/members": "會員管理",
  "/brand": "品牌合作",
  "/strategy": "內容策略",
  "/trends": "趨勢雷達",
  "/clips": "收藏庫",
  "/browse": "AI 社群探索",
  "/landing": "Landing Page",
  "/store": "商品商店",
  "/email": "Email 行銷",
  "/monetize": "變現顧問",
  "/analytics": "數據分析",
  "/settings": "設定",
};

function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 p-4">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Skeleton className="h-6 w-36" />
        </div>
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="flex-1">
        <header className="flex h-16 items-center border-b px-6">
          <Skeleton className="h-6 w-32" />
        </header>
        <div className="p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useRequireAuth();
  const { mutate: logout } = useLogout();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return null; // useRequireAuth will redirect
  }

  const pageTitle = pageTitles[pathname] ?? "儀表板";
  const initials = user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="text-lg font-bold">
            Creator Platform
          </Link>
        </div>

        <SidebarNav />

        <div className="border-t p-4">
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="flex h-16 items-center border-b px-6">
            <Link
              href="/"
              className="text-lg font-bold"
              onClick={() => setMobileOpen(false)}
            >
              Creator Platform
            </Link>
          </div>
          <div onClick={() => setMobileOpen(false)}>
            <SidebarNav />
          </div>
          <div className="border-t p-4">
            <button
              onClick={() => {
                setMobileOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" />
              登出
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1">
        <header className="flex h-16 items-center justify-between border-b px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold">{pageTitle}</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications placeholder */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={user.avatarUrl ?? undefined}
                      alt={user.displayName}
                    />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    設定
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  登出
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="p-4 md:p-6">{children}</div>
      </main>

      {/* AI Creator Assistant - floating chat */}
      <AiAssistant />
    </div>
  );
}
