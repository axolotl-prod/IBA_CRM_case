import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequireAuth } from "@/components/AppShell";
import { useCrm } from "@/lib/crm-store";
import type { TelegramChatsData } from "@/lib/crm-types";
import { downloadTelegramAttachment, loadTelegramChats, sendTelegramFile, sendTelegramMessage } from "@/lib/telegram-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Copy, Download, ExternalLink, FileText, MessageCircle, Paperclip, RefreshCw, Send, Smile, UserRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/chats")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { chat?: string; lead?: string } => ({
    chat: typeof search.chat === "string" ? search.chat : undefined,
    lead: typeof search.lead === "string" ? search.lead : undefined,
  }),
  component: () => <RequireAuth><Chats /></RequireAuth>,
});

const EMPTY: TelegramChatsData = { chats: [], messages: [], selectedChatId: "", leadConnection: null };
const EMOJI = ["😊", "👍", "❤️", "🙏", "🙂", "🔥", "✅", "🎉", "👋", "🤝", "💬", "✨"];

function Chats() {
  const { currentUser } = useCrm();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [data, setData] = useState<TelegramChatsData>(EMPTY);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (quiet = false) => {
    if (!currentUser) return;
    if (!quiet) setLoading(true);
    try {
      const result = await loadTelegramChats({ data: { userId: currentUser.id, chatId: search.chat, leadId: search.lead } });
      setData(result);
      if (result.selectedChatId && result.selectedChatId !== search.chat && !search.lead) {
        void navigate({ search: { chat: result.selectedChatId } as never, replace: true });
      }
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "Не удалось загрузить чаты");
    } finally { if (!quiet) setLoading(false); }
  }, [currentUser, navigate, search.chat, search.lead]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(true), 3_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => { messageEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [data.messages.length, data.selectedChatId]);

  const chats = useMemo(() => data.chats.filter((chat) => `${chat.name} ${chat.username} ${chat.phone} ${chat.leadName}`.toLowerCase().includes(query.toLowerCase())), [data.chats, query]);
  const selected = data.chats.find((chat) => chat.id === data.selectedChatId);

  const selectChat = (chatId: string) => void navigate({ search: { chat: chatId } as never });
  const submit = async () => {
    if (!currentUser || !data.selectedChatId || !text.trim() || sending) return;
    setSending(true);
    try {
      await sendTelegramMessage({ data: { userId: currentUser.id, chatId: data.selectedChatId, text } });
      setText("");
      await refresh(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Сообщение не отправлено"); }
    finally { setSending(false); }
  };

  const submitFile = async (file: File) => {
    if (!currentUser || !data.selectedChatId) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("userId", currentUser.id);
      form.set("chatId", data.selectedChatId);
      form.set("caption", text);
      form.set("file", file);
      await sendTelegramFile({ data: form });
      setText("");
      await refresh(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Файл не отправлен"); }
    finally { setSending(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const downloadFile = async (messageId: string) => {
    if (!currentUser) return;
    try {
      const file = await downloadTelegramAttachment({ data: { userId: currentUser.id, messageId } });
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = file.name; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Файл недоступен"); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div><h1 className="text-xl sm:text-2xl font-bold">Чаты</h1><p className="text-xs text-muted-foreground">Переписка клиентов с Telegram-ботом</p></div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Обновить</Button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)_260px] border rounded-lg overflow-hidden bg-card">
        <aside className={`${selected || data.leadConnection ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r`}>
          <div className="p-3 border-b"><Input placeholder="Поиск чатов..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="flex-1 overflow-y-auto">
            {chats.map((chat) => (
              <button key={chat.id} onClick={() => selectChat(chat.id)} className={`w-full text-left p-3 border-b hover:bg-accent/60 ${chat.id === data.selectedChatId ? "bg-accent" : ""}`}>
                <div className="flex items-start gap-2"><div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><UserRound className="w-4 h-4" /></div><div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="font-medium text-sm truncate">{chat.name}</span><span className="text-[10px] text-muted-foreground shrink-0">{shortTime(chat.lastMessageAt)}</span></div>
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground truncate flex-1">{chat.lastMessage || "Диалог подключён"}</span>{chat.unreadCount > 0 && <Badge className="h-5 min-w-5 px-1.5">{chat.unreadCount}</Badge>}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 truncate">{chat.manager || "Не назначен"}</div>
                </div></div>
              </button>
            ))}
            {!chats.length && <div className="p-6 text-center text-sm text-muted-foreground">Пока нет подключённых чатов</div>}
          </div>
        </aside>

        <section className={`${!selected && !data.leadConnection ? "hidden md:flex" : "flex"} min-h-0 flex-col`}>
          {selected ? <>
            <div className="h-16 px-4 border-b flex items-center gap-3 shrink-0"><Button variant="ghost" size="sm" className="md:hidden" onClick={() => void navigate({ search: {} as never })}>←</Button><div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><UserRound className="w-4 h-4" /></div><div className="min-w-0"><div className="font-semibold truncate">{selected.name}</div><div className="text-xs text-muted-foreground">{selected.username ? `@${selected.username}` : selected.phone || "Telegram подключён"}</div></div></div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 bg-muted/20">
              {data.messages.map((message) => <MessageBubble key={message.id} message={message} onDownload={() => void downloadFile(message.id)} />)}
              {!data.messages.length && <div className="h-full flex items-center justify-center text-sm text-muted-foreground">История пока пуста</div>}
              <div ref={messageEnd} />
            </div>
            {showEmoji && <div className="p-2 border-t flex flex-wrap gap-1">{EMOJI.map((emoji) => <button key={emoji} className="text-xl p-1 hover:bg-accent rounded" onClick={() => setText((value) => value + emoji)}>{emoji}</button>)}</div>}
            <div className="p-3 border-t shrink-0"><div className="flex items-end gap-2"><input ref={fileInput} type="file" className="hidden" onChange={(event) => event.target.files?.[0] && void submitFile(event.target.files[0])} /><Button variant="ghost" size="icon" onClick={() => fileInput.current?.click()} disabled={sending}><Paperclip className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => setShowEmoji((value) => !value)}><Smile className="w-4 h-4" /></Button><Textarea rows={1} className="min-h-10 max-h-32 resize-none" placeholder="Написать сообщение..." value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} /><Button size="icon" onClick={() => void submit()} disabled={sending || !text.trim()}><Send className="w-4 h-4" /></Button></div><div className="text-[10px] text-muted-foreground mt-1 ml-24">Enter — отправить, Shift+Enter — новая строка · файлы до 20 МБ</div></div>
          </> : data.leadConnection ? <ConnectionCard connection={data.leadConnection} onBack={() => void navigate({ search: {} as never })} /> : <div className="h-full flex flex-col items-center justify-center text-muted-foreground"><MessageCircle className="w-12 h-12 mb-3 opacity-30" /><div>Выберите чат</div></div>}
        </section>

        <aside className="hidden md:block border-l p-4 overflow-y-auto">
          {selected ? <div className="space-y-4"><div><div className="text-xs text-muted-foreground">Клиент</div><div className="font-semibold">{selected.leadName || selected.name}</div></div>{selected.tariff && <div><div className="text-xs text-muted-foreground">Тариф</div><div className="text-sm">{selected.tariff}</div></div>}<div><div className="text-xs text-muted-foreground">Менеджер</div><div className="text-sm">{selected.manager || "Не назначен"}</div></div>{selected.leadId && <Button className="w-full" variant="outline" onClick={() => void navigate({ to: "/kanban", search: { lead: selected.leadId } as never })}><ExternalLink className="w-4 h-4 mr-2" />Открыть заявку</Button>}</div> : <div className="text-sm text-muted-foreground">Карточка клиента появится после выбора чата.</div>}
        </aside>
      </div>
    </div>
  );
}

function MessageBubble({ message, onDownload }: { message: TelegramChatsData["messages"][number]; onDownload: () => void }) {
  const outgoing = message.direction !== "incoming";
  return <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 ${outgoing ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm"}`}>
    {message.senderName && <div className="text-[10px] opacity-70 mb-1">{message.senderName}</div>}
    {message.fileName && <button onClick={onDownload} className="flex items-center gap-2 text-sm underline underline-offset-2"><FileText className="w-4 h-4" /><span className="truncate">{message.fileName}</span><Download className="w-3 h-3" /></button>}
    {message.text && <div className="text-sm whitespace-pre-wrap break-words mt-1">{message.text}</div>}
    <div className="text-[10px] opacity-60 text-right mt-1">{shortTime(message.createdAt)}{outgoing && ` · ${message.status === "sent" ? "отправлено" : message.status === "failed" ? "ошибка" : "отправляется"}`}</div>
    {message.error && <div className="text-[10px] text-destructive-foreground mt-1">{message.error}</div>}
  </div></div>;
}

function ConnectionCard({ connection, onBack }: { connection: NonNullable<TelegramChatsData["leadConnection"]>; onBack: () => void }) {
  const copy = async () => { await navigator.clipboard.writeText(connection.inviteUrl); toast.success("Ссылка скопирована"); };
  return <div className="h-full flex items-center justify-center p-5"><Card className="max-w-lg p-6 space-y-4"><Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>← Назад</Button><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center"><MessageCircle className="w-5 h-5" /></div><div><h2 className="font-semibold">Telegram для {connection.leadName}</h2><p className="text-xs text-muted-foreground">Клиент ещё не подключил бота</p></div></div><p className="text-sm text-muted-foreground">Отправьте клиенту персональную ссылку. После нажатия Start диалог автоматически появится в CRM.</p>{connection.inviteUrl ? <><Input readOnly value={connection.inviteUrl} /><div className="flex gap-2"><Button className="flex-1" onClick={() => void copy()}><Copy className="w-4 h-4 mr-2" />Скопировать ссылку</Button><Button variant="outline" asChild><a href={connection.inviteUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a></Button></div></> : <div className="text-sm text-destructive">Не удалось определить username бота. Проверьте TELEGRAM_BOT_TOKEN.</div>}</Card></div>;
}

function shortTime(value: string): string {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
