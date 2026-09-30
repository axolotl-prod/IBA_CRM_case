import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm } from "@/lib/crm-store";
import type { InvoiceDraftInput, InvoicePageData, InvoiceSummary } from "@/lib/crm-types";
import { confirmInvoice, downloadInvoice, loadInvoices, previewInvoice, sendInvoice } from "@/lib/invoice-functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, FileCheck2, FileText, Loader2, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({ lead: typeof search.lead === "string" ? search.lead : undefined }),
  component: () => <RequireAuth><Invoices /></RequireAuth>,
});

const EMPTY: InvoicePageData = {
  invoices: [], company: { name: "", inn: "", kpp: "", ogrn: "", address: "", bankName: "", bik: "", checkingAccount: "", correspondentAccount: "", director: "", isTest: true }, selectedLead: null, telegramConnected: false,
};

function defaultDraft(leadId: string, tariff = "", amount = 0): InvoiceDraftInput {
  const due = new Date(); due.setDate(due.getDate() + 7);
  return { leadId, description: tariff || "Консультационные услуги", amount: amount || 0, quantity: 1, dueDate: due.toISOString().slice(0, 10), vatMode: "none", vatRate: 22, comment: "", paymentPurpose: "" };
}

function Invoices() {
  const { currentUser } = useCrm();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [data, setData] = useState<InvoicePageData>(EMPTY);
  const [draft, setDraft] = useState<InvoiceDraftInput>(() => defaultDraft(search.lead || ""));
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFile, setPreviewFile] = useState<{ name: string; blob: Blob } | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | string>("");

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    const result = await loadInvoices({ data: { userId: currentUser.id, leadId: search.lead } });
    setData(result);
    if (result.selectedLead) setDraft((current) => current.leadId === result.selectedLead!.id ? current : defaultDraft(result.selectedLead!.id, result.selectedLead!.tariff, result.selectedLead!.sum));
  }, [currentUser, search.lead]);

  useEffect(() => { void refresh().catch((error) => toast.error(error instanceof Error ? error.message : "Не удалось загрузить счета")); }, [refresh]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const fingerprint = useMemo(() => JSON.stringify(draft), [draft]);
  const previewCurrent = Boolean(previewUrl && previewFingerprint === fingerprint);
  const patch = <K extends keyof InvoiceDraftInput>(key: K, value: InvoiceDraftInput[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const makePreview = async () => {
    if (!currentUser) return;
    setBusy("preview");
    try {
      const file = await previewInvoice({ data: { userId: currentUser.id, invoice: draft } });
      const blob = base64Blob(file.base64, file.mime);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url); setPreviewFile({ name: file.name, blob }); setPreviewFingerprint(fingerprint);
      toast.success("Предпросмотр сформирован");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось сформировать PDF"); }
    finally { setBusy(""); }
  };

  const save = async () => {
    if (!currentUser || !previewCurrent) return;
    setBusy("save");
    try {
      await confirmInvoice({ data: { userId: currentUser.id, invoice: draft } });
      toast.success("Счёт сохранён в карточке клиента");
      setPreviewFingerprint(""); setPreviewFile(null); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl("");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось сохранить счёт"); }
    finally { setBusy(""); }
  };

  const downloadSaved = async (invoice: InvoiceSummary) => {
    if (!currentUser) return;
    setBusy(invoice.id + ":download");
    try { const file = await downloadInvoice({ data: { userId: currentUser.id, invoiceId: invoice.id } }); downloadBlob(base64Blob(file.base64, file.mime), file.name); }
    catch (error) { toast.error(error instanceof Error ? error.message : "PDF недоступен"); }
    finally { setBusy(""); }
  };

  const send = async (invoice: InvoiceSummary) => {
    if (!currentUser) return;
    setBusy(invoice.id + ":send");
    try { await sendInvoice({ data: { userId: currentUser.id, invoiceId: invoice.id } }); toast.success("Счёт отправлен в Telegram"); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось отправить счёт"); }
    finally { setBusy(""); }
  };

  return <div className="h-full overflow-y-auto pb-6">
    <div className="flex items-start justify-between gap-3 mb-4"><div><h1 className="text-xl sm:text-2xl font-bold">Счета</h1><p className="text-sm text-muted-foreground">Предпросмотр, сохранение и отправка PDF-счетов</p></div>{data.selectedLead && <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/kanban", search: { lead: data.selectedLead!.id } })}><ExternalLink className="w-4 h-4 mr-2" />Заявка</Button>}</div>
    {data.company.isTest && <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"><b>Тестовый режим.</b> Используются вымышленные реквизиты «{data.company.name}». На PDF будет отметка «НЕ ДЛЯ ОПЛАТЫ».</div>}
    {data.selectedLead && !data.telegramConnected && <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Клиент ещё не подключил Telegram-бота. Счёт можно создать и сохранить, но отправка станет доступна после привязки чата через <b>/start</b>.</div>}

    {data.selectedLead ? <div className="grid lg:grid-cols-[420px_minmax(0,1fr)] gap-4 mb-6">
      <Card className="p-4 space-y-3">
        <div><h2 className="font-semibold">Новый счёт для {data.selectedLead.name}</h2><p className="text-xs text-muted-foreground">Сначала сформируйте и скачайте предпросмотр</p></div>
        <Field label="Описание"><Textarea value={draft.description} onChange={(event) => patch("description", event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Сумма, ₽"><Input type="number" min="0" step="0.01" value={draft.amount || ""} onChange={(event) => patch("amount", Number(event.target.value))} /></Field><Field label="Количество"><Input type="number" min="1" step="1" value={draft.quantity} onChange={(event) => patch("quantity", Number(event.target.value))} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Оплатить до"><Input type="date" value={draft.dueDate} onChange={(event) => patch("dueDate", event.target.value)} /></Field><Field label="НДС"><Select value={draft.vatMode} onValueChange={(value: "none" | "included") => patch("vatMode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Без НДС</SelectItem><SelectItem value="included">НДС включён</SelectItem></SelectContent></Select></Field></div>
        {draft.vatMode === "included" && <Field label="Ставка НДС"><Select value={String(draft.vatRate)} onValueChange={(value) => patch("vatRate", Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[5,7,10,20,22].map((rate) => <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>)}</SelectContent></Select></Field>}
        <Field label="Назначение платежа"><Input value={draft.paymentPurpose} placeholder="Заполнится автоматически, если оставить пустым" onChange={(event) => patch("paymentPurpose", event.target.value)} /></Field>
        <Field label="Комментарий"><Textarea value={draft.comment} onChange={(event) => patch("comment", event.target.value)} /></Field>
        <Button className="w-full" variant="outline" disabled={Boolean(busy)} onClick={() => void makePreview()}>{busy === "preview" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}Сформировать предпросмотр</Button>
        {previewFile && <Button className="w-full" variant="secondary" onClick={() => downloadBlob(previewFile.blob, previewFile.name)}><Download className="w-4 h-4 mr-2" />Скачать предварительный PDF</Button>}
        <Button className="w-full" disabled={!previewCurrent || Boolean(busy)} onClick={() => void save()}>{busy === "save" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Сохранить в карточку</Button>
        {previewUrl && !previewCurrent && <p className="text-xs text-amber-600">Данные изменены. Сформируйте предпросмотр заново перед сохранением.</p>}
      </Card>
      <Card className="min-h-[640px] overflow-hidden">{previewUrl ? <iframe title="Предпросмотр счёта" src={previewUrl} className="w-full h-[75vh] min-h-[640px]" /> : <div className="h-full min-h-[640px] flex flex-col items-center justify-center text-muted-foreground"><FileCheck2 className="w-14 h-14 mb-3 opacity-30" /><p>Здесь появится PDF-предпросмотр</p></div>}</Card>
    </div> : <Card className="p-6 mb-6 text-center text-muted-foreground">Чтобы создать счёт, откройте заявку и нажмите «Счета».</Card>}

    <div><h2 className="font-semibold mb-3">{data.selectedLead ? "Счета клиента" : "Все доступные счета"}</h2><div className="space-y-2">{data.invoices.map((invoice) => <Card key={invoice.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{invoice.number}</span><StatusBadge invoice={invoice} />{invoice.isTest && <Badge variant="outline" className="text-amber-600 border-amber-400">Тестовый</Badge>}</div><div className="text-sm truncate mt-1">{invoice.leadName} · {invoice.description}</div><div className="text-xs text-muted-foreground mt-1">{fmtMoney(invoice.amount)} · {invoice.manager} · {formatDate(invoice.createdAt)}</div></div><div className="flex gap-2 flex-wrap"><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void downloadSaved(invoice)}>{busy === invoice.id + ":download" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}<span className="hidden sm:inline">PDF</span></Button><Button size="sm" title={invoice.telegramConnected ? "" : "Клиент ещё не подключил Telegram-бота"} disabled={Boolean(busy) || !invoice.telegramConnected || !["saved","sent"].includes(invoice.status)} onClick={() => void send(invoice)}>{busy === invoice.id + ":send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}{invoice.status === "sent" ? "Отправить повторно" : "Отправить в Telegram"}</Button></div></Card>)}{!data.invoices.length && <div className="text-sm text-muted-foreground py-6">Сохранённых счетов пока нет.</div>}</div></div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label className="text-xs">{label}</Label>{children}</div>; }
function StatusBadge({ invoice }: { invoice: InvoiceSummary }) { const labels: Record<string,string>={generating:"Формируется",saved:"Сохранён",sent:"Отправлен",paid:"Оплачен",cancelled:"Отменён",failed:"Ошибка"}; return <Badge variant={invoice.status === "sent" || invoice.status === "paid" ? "default" : "secondary"}>{labels[invoice.status] || invoice.status}</Badge>; }
function base64Blob(base64: string, mime: string): Blob { const binary=atob(base64); const bytes=new Uint8Array(binary.length); for(let index=0;index<binary.length;index++) bytes[index]=binary.charCodeAt(index); return new Blob([bytes],{type:mime}); }
function downloadBlob(blob: Blob, name: string) { const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=name; anchor.click(); window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
function formatDate(value: string) { const date=new Date(value.includes("T")?value:`${value.replace(" ","T")}Z`); return Number.isNaN(date.getTime())?value:date.toLocaleDateString("ru-RU"); }
