"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, Bot as BotIcon, MessageSquare, Database, Send, Globe, Lock, FileText, Link, Video, Edit3, HelpCircle } from "lucide-react";
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
  const t = useTranslations("bot");
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
            {t("chatEmptyHint")}
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
              {t("thinking")}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("chatInputPlaceholder")}
          className="min-h-[40px] max-h-[120px] resize-none"
          rows={1}
          onKeyDown={(e) => {
            // e.nativeEvent.isComposing: 注音/日文等 IME 正在組字時不送出
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button size="icon" className="shrink-0" onClick={handleSend} disabled={chat.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Knowledge Base Tab ───
function KnowledgeBaseTab() {
  const t = useTranslations("bot");
  const { data: kbs, isLoading } = useKnowledgeBases();
  const createKb = useCreateKnowledgeBase();
  const deleteKb = useDeleteKnowledgeBase();
  const ingest = useIngestKnowledge();
  const [createOpen, setCreateOpen] = useState(false);
  const [ingestId, setIngestId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");
  const [ingestContent, setIngestContent] = useState("");

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("addKnowledgeBase")}
        </Button>
      </div>

      {!kbs?.data?.length ? (
        <EmptyState
          icon={Database}
          title={t("noKnowledgeBase")}
          description={t("noKnowledgeBaseDesc")}
          actionLabel={t("addKnowledgeBase")}
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kbs.data.map((kb) => (
            <Card key={kb.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{kb.name}</CardTitle>
                  <Badge variant="secondary">{t("chunkCount", { count: kb.chunkCount })}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {kb.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{kb.description}</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIngestId(kb.id)}>
                    {t("ingestContent")}
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
          <DialogHeader><DialogTitle>{t("addKnowledgeBase")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("labelName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("kbNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("labelDescription")}</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("optional")} />
            </div>
            <div className="space-y-2">
              <Label>{t("labelSourceType")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "MANUAL", label: t("sourceManual"), icon: Edit3 },
                  { value: "QA_PAIRS", label: t("sourceQA"), icon: HelpCircle },
                  { value: "DOCUMENT", label: t("sourceDocument"), icon: FileText },
                  { value: "URL", label: t("sourceURL"), icon: Link },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSourceType(opt.value)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      sourceType === opt.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
            <Button
              onClick={() => {
                createKb.mutate(
                  { name, description: desc || undefined, sourceType },
                  {
                    onSuccess: () => { toast.success(t("kbCreated")); setCreateOpen(false); setName(""); setDesc(""); setSourceType("MANUAL"); },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
              disabled={createKb.isPending}
            >
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ingest */}
      <Dialog open={!!ingestId} onOpenChange={() => setIngestId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("ingestContent")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>{t("labelContentText")}</Label>
            <Textarea
              value={ingestContent}
              onChange={(e) => setIngestContent(e.target.value)}
              placeholder={t("ingestPlaceholder")}
              rows={8}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIngestId(null)}>{t("cancel")}</Button>
            <Button
              onClick={() => {
                if (ingestId) {
                  ingest.mutate(
                    { id: ingestId, content: ingestContent },
                    {
                      onSuccess: () => { toast.success(t("ingestSuccess")); setIngestId(null); setIngestContent(""); },
                      onError: (e) => toast.error(e.message),
                    },
                  );
                }
              }}
              disabled={ingest.isPending}
            >
              {ingest.isPending ? t("ingesting") : t("ingest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete KB */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("deleteKnowledgeBase")}
        description={t("deleteKnowledgeBaseConfirm")}
        confirmLabel={t("delete")}
        variant="destructive"
        loading={deleteKb.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteKb.mutate(deleteId, {
              onSuccess: () => { toast.success(t("kbDeleted")); setDeleteId(null); },
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
  const t = useTranslations("bot");
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
    if (!name.trim()) { toast.error(t("nameRequired")); return; }
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
          onSuccess: () => { toast.success(t("botUpdated")); setEditBot(null); resetForm(); },
          onError: (e) => toast.error(e.message),
        },
      );
    } else {
      createBot.mutate(payload, {
        onSuccess: () => { toast.success(t("botCreated")); setCreateOpen(false); resetForm(); },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      <Tabs defaultValue="bots">
        <TabsList>
          <TabsTrigger value="bots">
            <MessageSquare className="mr-1 h-4 w-4" />
            {t("tabBots")}
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <Database className="mr-1 h-4 w-4" />
            {t("tabKnowledge")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bots" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              {t("addBot")}
            </Button>
          </div>

          {isLoading ? (
            <TableSkeleton />
          ) : !botsData?.data?.length ? (
            <EmptyState
              icon={BotIcon}
              title={t("noBot")}
              description={t("noBotDesc")}
              actionLabel={t("addBot")}
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
                        {bot.isPublic ? <><Globe className="mr-1 h-3 w-3" />{t("public")}</> : <><Lock className="mr-1 h-3 w-3" />{t("private")}</>}
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
                        {t("testChat")}
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
                        {t("edit")}
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
            <DialogTitle>{editBot ? t("editBot") : t("addBot")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("labelName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("botNamePlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label>{t("labelWelcomeMessage")}</Label>
              <Input value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder={t("optional")} />
            </div>
            <div className="space-y-2">
              <Label>{t("labelSystemPrompt")}</Label>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t("systemPromptPlaceholder")}
                rows={4}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("labelPublicBot")}</Label>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditBot(null); resetForm(); }}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreateOrUpdate} disabled={createBot.isPending || updateBot.isPending}>
              {editBot ? t("update") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={!!chatBotId} onOpenChange={() => setChatBotId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("testChat")}</DialogTitle></DialogHeader>
          {chatBotId && <ChatPanel botId={chatBotId} />}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t("deleteBot")}
        description={t("deleteBotConfirm")}
        confirmLabel={t("delete")}
        variant="destructive"
        loading={deleteBot.isPending}
        onConfirm={() => {
          if (deleteId) {
            deleteBot.mutate(deleteId, {
              onSuccess: () => { toast.success(t("botDeleted")); setDeleteId(null); },
              onError: (e) => toast.error(e.message),
            });
          }
        }}
      />
    </div>
  );
}
