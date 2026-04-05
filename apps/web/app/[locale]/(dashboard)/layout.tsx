"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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
  MessageSquare,
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
import { LanguageSwitcher } from "@/components/language-switcher";

const sidebarItemDefs = [
  { key: "overview", href: "/", icon: LayoutDashboard },
  { key: "videos", href: "/videos", icon: Video },
  { key: "schedule", href: "/schedule", icon: Calendar },
  { key: "bot", href: "/bot", icon: Bot },
  { key: "members", href: "/members", icon: Users },
  { key: "brand", href: "/brand", icon: Handshake },
  { key: "strategy", href: "/strategy", icon: Lightbulb },
  { key: "trends", href: "/trends", icon: Radar },
  { key: "clips", href: "/clips", icon: Bookmark },
  { key: "browse", href: "/browse", icon: Globe },
  { key: "landing", href: "/landing", icon: PanelTop },
  { key: "store", href: "/store", icon: ShoppingBag },
  { key: "email", href: "/email", icon: Mail },
  { key: "interactions", href: "/interactions", icon: MessageSquare },
  { key: "monetize", href: "/monetize", icon: DollarSign },
  { key: "analytics", href: "/analytics", icon: BarChart3 },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

const pathToNavKey: Record<string, string> = {
  "/": "overview",
  "/videos": "videos",
  "/schedule": "schedule",
  "/bot": "bot",
  "/members": "members",
  "/brand": "brand",
  "/strategy": "strategy",
  "/trends": "trends",
  "/clips": "clips",
  "/browse": "browse",
  "/landing": "landing",
  "/store": "store",
  "/email": "email",
  "/interactions": "interactions",
  "/monetize": "monetize",
  "/analytics": "analytics",
  "/settings": "settings",
};

function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex-1 space-y-1 p-4">
      {sidebarItemDefs.map((item) => {
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
            {t(item.key)}
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

  const t = useTranslations("nav");
  const navKey = pathToNavKey[pathname];
  const pageTitle = navKey ? t(navKey) : t("dashboard");
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
            {t("logout")}
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
              {t("logout")}
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
            <LanguageSwitcher />
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
                    {t("settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("logout")}
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
