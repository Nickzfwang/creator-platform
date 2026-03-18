"use client";

import { useState } from "react";
import { Plus, Trash2, Bot as BotIcon, MessageSquare, Database, Send, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  useBots,
  useCreateBot,
  useUpdateBot,
  useDeleteBot,
  useBotConversations,
  useBotChat,
  useKnowledgeBases,
  useCreateKnowledgeBase,
  useIngestKnowledge,
  useDeleteKnowledgeBase,
  type Bot,
} from "@/hooks/use-bots";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TableSkeleton } from "@/components/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Chat Panel ───
function ChatPanel({ botId }: { botId: string }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [convId, setConvId] = useState<string | undefined>();
  const chat = useBotChat();

  const handleSend = () => {
    if (!message.trim()) return;
    const userMsg = message;
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setMessage("");

    chat.mutate(
      { botId, message: userMsg, conversationId: convId },
      {
        onSuccess: (res) => {
          setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
          setConvId(res.conversationId);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="flex h-80 flex-col rounded-lg border">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            輸入訊息開始對話
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {chat.isPending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              思考中...
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t p-3">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="輸入訊息..."
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        />
        <Button size="icon" onClick={handleSend} disabled={chat.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Knowledge Base Tab ───
function KnowledgeBaseTab() {
  const { data: kbs, isLoading } = useKnowledgeBases();
  const createKb = useCreateKnowledgeBase();
  const deleteKb = useDeleteKnowledgeBase();
  const ingest = useIngestKnowledge();
  const [createOpen, setCreateOpen] = useState(false);
  const [ingestId, setIngestId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [ingestContent, setIngestContent] = useState("");

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增知識庫
        </Button>
      </div>

      {!kbs?.data?.length ? (
        <EmptyState
          icon={Database}
          title="尚無知識庫"
          description="建立知識庫並匯入內容，讓 Bot 回答更準確"
          actionLabel="新增知識庫"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kbs.data.map((kb) => (
            <Card key={kb.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{kb.name}</CardTitle>
                  <Badge variant="secondary">{kb.chunkCount} 片段</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {kb.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{kb.description}</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIngestId(kb.id)}>
                    匯入內容
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteId(kb.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create KB */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增知識庫</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名稱</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="知識庫名稱" />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="選填" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              onClick={() => {
                createKb.mutate(
                  { name, description: desc || undefined },
                  {
                    onSuccess: () => { toast.success("知識庫已建立"); setCreateOpen(false); setName(""); setDesc(""); },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
              disabled={createKb.isPending}
            >
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ingest */}
      <Dialog open={!!ingestId} onOpenChange={() => setIngestId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>匯入內容</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>內容文字</Label>
            <Textarea
              value={ingestContent}
              onChange={(e) => setIngestContent(e.target.value)}
              placeholder="貼上要匯入的文字內容..."
              rows={8}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIngestId(null)}>取消</Button>
            <Button
              onClick={() => {
                if (ingestId) {
                  ingest.mutate(
                    { id: ingestId, content: ingestContent },
                    {
                      onSuccess: () => { toast.success("內容已匯入"); setIngestId(null); setIngestContent(""); },
                      onError: (e) => toast.error(e.message),
                    },
                  );
                }
              }}
              disabled={ingest.isPending}
            >
              {ingest.isPending ? "匯入中..." : "匯入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete KB */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除知識庫"
        description="確定要刪除此知識庫嗎？所有匯入的內容都會被刪除。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteKb.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteKb.mutate(deleteId, {
              onSuccess: () => { toast.success("知識庫已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}

// ─── Main Page ───
export default function BotPage() {
  const { data: botsData, isLoading } = useBots();
  const createBot = useCreateBot();
  const updateBot = useUpdateBot();
  const deleteBot = useDeleteBot();

  const [createOpen, setCreateOpen] = useState(false);
  const [editBot, setEditBot] = useState<Bot | null>(null);
  const [chatBotId, setChatBotId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const resetForm = () => { setName(""); setWelcomeMessage(""); setSystemPrompt(""); setIsPublic(false); };

  const handleCreateOrUpdate = () => {
    if (!name.trim()) { toast.error("請輸入 Bot 名稱"); return; }
    const payload = {
      name,
      welcomeMessage: welcomeMessage || undefined,
      systemPrompt: systemPrompt || undefined,
      isPublic,
    };

    if (editBot) {
      updateBot.mutate(
        { id: editBot.id, data: payload },
        {
          onSuccess: () => { toast.success("Bot 已更新"); setEditBot(null); resetForm(); },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      createBot.mutate(payload, {
        onSuccess: () => { toast.success("Bot 已建立"); setCreateOpen(false); resetForm(); },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bot 設定"
        description="建立和管理 AI 顧問 Bot 與知識庫"
      />

      <Tabs defaultValue="bots">
        <TabsList>
          <TabsTrigger value="bots">
            <MessageSquare className="mr-1 h-4 w-4" />
            Bot 列表
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <Database className="mr-1 h-4 w-4" />
            知識庫
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bots" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              新增 Bot
            </Button>
          </div>

          {isLoading ? (
            <TableSkeleton />
          ) : !botsData?.data?.length ? (
            <EmptyState
              icon={BotIcon}
              title="尚無 Bot"
              description="建立您的第一個 AI 顧問 Bot"
              actionLabel="新增 Bot"
              onAction={() => { resetForm(); setCreateOpen(true); }}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {botsData.data.map((bot) => (
                <Card key={bot.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{bot.name}</CardTitle>
                      <Badge variant={bot.isPublic ? "default" : "secondary"}>
                        {bot.isPublic ? <><Globe className="mr-1 h-3 w-3" />公開</> : <><Lock className="mr-1 h-3 w-3" />私有</>}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {bot.welcomeMessage && (
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{bot.welcomeMessage}</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setChatBotId(bot.id)}>
                        <MessageSquare className="mr-1 h-3 w-3" />
                        測試對話
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditBot(bot);
                          setName(bot.name);
                          setWelcomeMessage(bot.welcomeMessage || "");
                          setSystemPrompt(bot.systemPrompt || "");
                          setIsPublic(bot.isPublic);
                        }}
                      >
                        編輯
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(bot.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeBaseTab />
        </TabsContent>
      </Tabs>

      {/* Create/Edit Bot Dialog */}
      <Dialog
        open={createOpen || !!editBot}
        onOpenChange={(open) => {
          if (!open) { setCreateOpen(false); setEditBot(null); resetForm(); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editBot ? "編輯 Bot" : "新增 Bot"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>名稱</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bot 名稱" />
            </div>
            <div className="space-y-2">
              <Label>歡迎訊息</Label>
              <Input value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="選填" />
            </div>
            <div className="space-y-2">
              <Label>系統提示詞</Label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="定義 Bot 的角色和行為..."
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>公開 Bot</Label>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditBot(null); resetForm(); }}>
              取消
            </Button>
            <Button onClick={handleCreateOrUpdate} disabled={createBot.isPending || updateBot.isPending}>
              {editBot ? "更新" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={!!chatBotId} onOpenChange={() => setChatBotId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>測試對話</DialogTitle></DialogHeader>
          {chatBotId && <ChatPanel botId={chatBotId} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="刪除 Bot"
        description="確定要刪除此 Bot 嗎？所有對話記錄都會被刪除。"
        confirmLabel="刪除"
        variant="destructive"
        loading={deleteBot.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteBot.mutate(deleteId, {
              onSuccess: () => { toast.success("Bot 已刪除"); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
