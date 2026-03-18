"use client";

import { useState } from "react";
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
  const user = useAuthStore((s) => s.user);
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">個人資料</CardTitle>
        <CardDescription>管理您的個人資料和帳號設定</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>電子郵件</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label>顯示名稱</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            updateProfile.mutate(
              { displayName },
              {
                onSuccess: () => toast.success("已更新"),
                onError: (e) => toast.error(e.message),
              },
            );
          }}
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? "更新中..." : "儲存"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Social Accounts Tab ───
function SocialTab() {
  const { data: accounts, isLoading } = useSocialAccounts();
  const connectPlatform = useConnectPlatform();
  const disconnectAccount = useDisconnectAccount();
  const [disconnectId, setDisconnectId] = useState<string | null>(null);

  const allPlatforms = ["YOUTUBE", "INSTAGRAM", "TIKTOK", "FACEBOOK", "TWITTER", "THREADS"];
  const connectedPlatforms = accounts?.map((a) => a.platform) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">社群帳號</CardTitle>
        <CardDescription>連結您的社群平台帳號</CardDescription>
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
                  {account.followerCount.toLocaleString()} 粉絲
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisconnectId(account.id)}
            >
              取消連結
            </Button>
          </div>
        ))}

        {/* Available to connect */}
        <Separator />
        <p className="text-sm text-muted-foreground">可連結的平台</p>
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
          title="取消連結"
          description="確定要取消連結此社群帳號嗎？"
          confirmLabel="取消連結"
          variant="destructive"
          loading={disconnectAccount.isPending}
          onConfirm={() => {
            if (disconnectId) {
              disconnectAccount.mutate(disconnectId, {
                onSuccess: () => { toast.success("已取消連結"); setDisconnectId(null); },
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
              <CardDescription>管理 API 存取金鑰</CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3 w-3" />
              新增金鑰
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!keys?.length ? (
            <p className="text-sm text-muted-foreground">尚無 API 金鑰</p>
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
                      {key.isActive ? "啟用" : "已撤銷"}
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
            <CardTitle className="text-base">API 速率限制</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">方案</p>
                <p className="font-medium">{rateLimits.plan}</p>
              </div>
              <div>
                <p className="text-muted-foreground">類型</p>
                <p className="font-medium">{rateLimits.isCustom ? "自訂" : "預設"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">每分鐘請求</p>
                <p className="font-medium">{rateLimits.limits.requestsPerMinute}</p>
              </div>
              <div>
                <p className="text-muted-foreground">每日請求</p>
                <p className="font-medium">{rateLimits.limits.requestsPerDay.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create API Key */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增 API 金鑰</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>名稱</Label>
            <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="例：Production Key" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
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
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show New Key */}
      <Dialog open={!!newKey} onOpenChange={() => setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API 金鑰已建立</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              請立即複製此金鑰，它不會再次顯示。
            </p>
            <div className="flex items-center gap-2">
              <Input value={newKey ?? ""} readOnly className="font-mono text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  if (newKey) {
                    navigator.clipboard.writeText(newKey);
                    toast.success("已複製");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>確定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm */}
      <ConfirmDialog
        open={!!revokeId}
        onOpenChange={() => setRevokeId(null)}
        title="撤銷 API 金鑰"
        description="確定要撤銷此金鑰嗎？使用此金鑰的應用程式將無法存取 API。"
        confirmLabel="撤銷"
        variant="destructive"
        loading={revokeKey.isPending}
        onConfirm={() => {
          if (revokeId) {
            revokeKey.mutate(revokeId, {
              onSuccess: () => { toast.success("金鑰已撤銷"); setRevokeId(null); },
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
  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="管理您的帳號、社群連結和 API 設定" />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">個人資料</TabsTrigger>
          <TabsTrigger value="social">社群帳號</TabsTrigger>
          <TabsTrigger value="api">API 設定</TabsTrigger>
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
