"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Eye, EyeOff, Link as LinkIcon, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { useUpdateProfile } from "@/hooks/use-auth";
import {
  useTenant,
  useUpdateTenantSettings,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useWebhookEvents,
  useRateLimits,
} from "@/hooks/use-settings";
import { useSocialAccounts, useConnectPlatform, useDisconnectAccount } from "@/hooks/use-social";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Profile Tab ───
function ProfileTab() {
  const t = useTranslations("settings");
  const user = useAuthStore((s) => s.user);
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profile.title")}</CardTitle>
        <CardDescription>{t("profile.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("profile.emailLabel")}</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label>{t("profile.displayNameLabel")}</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            updateProfile.mutate(
              { displayName },
              {
                onSuccess: () => toast.success(t("profile.updated")),
                onError: (e) => toast.error(e.message),
              },
            );
          }}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? t("profile.updating") : t("profile.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Social Accounts Tab ───
function SocialTab() {
  const t = useTranslations("settings");
  const { data: accounts, isLoading } = useSocialAccounts();
  const connectPlatform = useConnectPlatform();
  const disconnectAccount = useDisconnectAccount();
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  const allPlatforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "FACEBOOK", "TWITTER", "THREADS"];
  const connectedPlatforms = accounts?.map((a) => a.platform) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("social.title")}</CardTitle>
        <CardDescription>{t("social.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected */}
        {accounts?.map((account) => (
          <div key={account.id} className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{account.platform}</Badge>
                <span className="text-sm font-medium">{account.platformUsername}</span>
              </div>
              {account.followerCount !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("social.followerCount", { count: account.followerCount.toLocaleString() })}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisconnectId(account.id)}
            >
              {t("social.disconnect")}
            </Button>
          </div>
        ))}

        {/* Available to connect */}
        <Separator />
        <p className="text-sm text-muted-foreground">{t("social.availablePlatforms")}</p>
        <div className="flex flex-wrap gap-2">
          {allPlatforms
            .filter((p) => !connectedPlatforms.includes(p))
            .map((platform) => (
              <Button
                key={platform}
                variant="outline"
                size="sm"
                onClick={() => connectPlatform.mutate(platform)}
                disabled={connectPlatform.isPending}
              >
                <LinkIcon className="mr-1 h-3 w-3" />
                {platform}
              </Button>
            ))}
        </div>

        <ConfirmDialog
          open={!!disconnectId}
          onOpenChange={() => setDisconnectId(null)}
          title={t("social.disconnectTitle")}
          description={t("social.disconnectDescription")}
          confirmLabel={t("social.disconnect")}
          variant="destructive"
          loading={disconnectAccount.isPending}
          onConfirm={() => {
            if (disconnectId) {
              disconnectAccount.mutate(disconnectId, {
                onSuccess: () => { toast.success(t("social.disconnected")); setDisconnectId(null); },
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

// ─── API Keys Tab ───
function ApiKeysTab() {
  const t = useTranslations("settings");
  const { data: keys, isLoading } = useApiKeys();
  const { data: rateLimits } = useRateLimits();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">API Keys</CardTitle>
              <CardDescription>{t("apiKeys.description")}</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3 w-3" />
              {t("apiKeys.addKey")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!keys?.length ? (
            <p className="text-sm text-muted-foreground">{t("apiKeys.noKeys")}</p>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {key.keyPrefix}... · {key.scopes.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={key.isActive ? "default" : "secondary"}>
                      {key.isActive ? t("apiKeys.active") : t("apiKeys.revoked")}
                    </Badge>
                    {key.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => setRevokeId(key.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {rateLimits && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rateLimit.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t("rateLimit.plan")}</p>
                <p className="font-medium">{rateLimits.plan}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("rateLimit.type")}</p>
                <p className="font-medium">{rateLimits.isCustom ? t("rateLimit.custom") : t("rateLimit.default")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("rateLimit.requestsPerMinute")}</p>
                <p className="font-medium">{rateLimits.limits.requestsPerMinute}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("rateLimit.requestsPerDay")}</p>
                <p className="font-medium">{rateLimits.limits.requestsPerDay.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create API Key */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("apiKeys.createTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>{t("apiKeys.nameLabel")}</Label>
            <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="例：Production Key" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => {
                createKey.mutate(
                  { name: keyName },
                  {
                    onSuccess: (result) => {
                      setNewKey(result.key);
                      setCreateOpen(false);
                      setKeyName("");
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
              disabled={createKey.isPending}
            >
              {t("apiKeys.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show New Key */}
      <Dialog open={!!newKey} onOpenChange={() => setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("apiKeys.keyCreated")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("apiKeys.keyCreatedHint")}
            </p>
            <div className="flex items-center gap-2">
              <Input value={newKey ?? ""} readOnly className="font-mono text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  if (newKey) {
                    navigator.clipboard.writeText(newKey);
                    toast.success(t("common.copied"));
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>{t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={!!revokeId}
        onOpenChange={() => setRevokeId(null)}
        title={t("apiKeys.revokeTitle")}
        description={t("apiKeys.revokeDescription")}
        confirmLabel={t("apiKeys.revoke")}
        variant="destructive"
        loading={revokeKey.isPending}
        onConfirm={() => {
          if (revokeId) {
            revokeKey.mutate(revokeId, {
              onSuccess: () => { toast.success(t("apiKeys.keyRevoked")); setRevokeId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}

// ─── Main Page ───
export default function SettingsPage() {
  const t = useTranslations("settings");
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(t("oauth.accountConnected", { platform: connected }));
      window.history.replaceState({}, "", "/settings");
    } else if (error) {
      const messages: Record<string, string> = {
        missing_params: t("oauth.missingParams"),
        invalid_state: t("oauth.invalidState"),
        server_error: t("oauth.serverError"),
      };
      toast.error(messages[error] ?? t("oauth.connectFailed", { error }));
      window.history.replaceState({}, "", "/settings");
    }
  }, [searchParams, t]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />

      <Tabs defaultValue={searchParams.get("connected") || searchParams.get("error") ? "social" : "profile"}>
        <TabsList>
          <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="social">{t("tabs.social")}</TabsTrigger>
          <TabsTrigger value="api">{t("tabs.api")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="social" className="mt-4">
          <SocialTab />
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
