import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, STATUS_LABELS, STATUS_ORDER, type LeadStatus, type Lead } from "@/lib/crm-store";
import { TARIFFS } from "@/lib/crm-types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Plus, ReceiptText, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/kanban")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { lead?: string } => ({ lead: typeof search.lead === "string" ? search.lead : undefined }),
  component: () => (<RequireAuth><Kanban /></RequireAuth>),
});

const ALL = "__all__";

function Kanban() {
  const { visibleLeads, updateLead, addLead, currentUser, state, syncFromGoogleSheets, googleSheetsSyncing } = useCrm();
  const leads = visibleLeads();
  const [dragId, setDragId] = useState<string | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (!search.lead) return;
    const lead = leads.find((item) => item.id === search.lead);
    if (lead) {
      setEditLead(lead);
      void navigate({ search: {} as never, replace: true });
    }
  }, [leads, navigate, search.lead]);

  const [fManager, setFManager] = useState<string>(ALL);
  const [fTariff, setFTariff] = useState<string>(ALL);
  const [q, setQ] = useState("");

  const managers = state.users.map((u) => u.name);
  const tariffs = useMemo(
    () => Array.from(new Set(leads.map((l) => l.tariff).filter(Boolean))).sort(),
    [leads],
  );

  const filtered = leads.filter((l) => {
    if (fManager !== ALL && l.manager !== fManager) return false;
    if (fTariff !== ALL && l.tariff !== fTariff) return false;
    if (q && !`${l.name} ${l.request} ${l.tariff}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const onDrop = (status: LeadStatus) => {
    if (!dragId) return;
    updateLead(dragId, { status });
    setDragId(null);
    toast.success(`Перемещено в «${STATUS_LABELS[status]}»`);
  };

  const hasFilter = fManager !== ALL || fTariff !== ALL || q;

  const forceGoogleSync = async () => {
    try {
      const result = await syncFromGoogleSheets();
      toast.success(result.added > 0 ? `Добавлено новых заявок: ${result.added}` : "Новых заявок в Google Sheets нет");
    } catch (error) {
      console.error(error);
      toast.error("Не удалось обновить заявки из Google Sheets");
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-4 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Заявки</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {currentUser?.role === "admin" ? "Все заявки" : "Ваши заявки"} · {filtered.length} из {leads.length}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentUser?.role === "admin" && (
            <Button size="sm" variant="outline" disabled={googleSheetsSyncing} onClick={forceGoogleSync}>
              <RefreshCw className={`w-4 h-4 sm:mr-2 ${googleSheetsSyncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Обновить из Google Sheets</span>
            </Button>
          )}
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Новая заявка</span>
              </Button>
            </DialogTrigger>
            <NewLeadDialog
              managers={managers}
              defaultManager={currentUser!.name}
              onCreate={(l) => { addLead(l); setOpenNew(false); toast.success("Заявка создана"); }}
            />
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
        <Input placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-48" />
        {currentUser?.role === "admin" && (
          <Select value={fManager} onValueChange={setFManager}>
            <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44"><SelectValue placeholder="Менеджер" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все менеджеры</SelectItem>
              {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={fTariff} onValueChange={setFTariff}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44"><SelectValue placeholder="Тариф" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все тарифы</SelectItem>
            {tariffs.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setFManager(ALL); setFTariff(ALL); setQ(""); }}>
            <X className="w-4 h-4 mr-1" />Сбросить
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex md:grid md:grid-cols-5 gap-3 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none">

        {STATUS_ORDER.map((status) => {
          const col = filtered.filter((l) => l.status === status);
          const sum = col.reduce((s, l) => s + (l.sum || 0), 0);
          return (
            <div
              key={status}
              className="bg-muted/40 rounded-lg flex flex-col min-h-0 overflow-hidden shrink-0 w-[85%] sm:w-72 md:w-auto snap-start"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(status)}
            >

              <div className="p-3 shrink-0 border-b bg-muted/60">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">{STATUS_LABELS[status]}</div>
                  <Badge variant="secondary">{col.length}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{fmtMoney(sum)}</div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                {col.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onClick={() => setEditLead(l)}
                    className="p-3 cursor-grab active:cursor-grabbing hover:border-primary transition"
                  >
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <div className="font-medium text-sm">{l.name}</div>
                      {l.sum > 0 && <div className="text-xs font-semibold">{fmtMoney(l.sum)}</div>}
                    </div>
                    {l.tariff && <div className="text-xs text-muted-foreground">{l.tariff}</div>}
                    {l.request && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{l.request}</div>}
                    <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                      <span>{l.date}</span>
                      <span>{l.manager}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editLead} onOpenChange={(o) => !o && setEditLead(null)}>
        {editLead && (
          <EditLeadDialog
            lead={editLead}
            managers={managers}
            onChat={() => void navigate({ to: "/chats", search: { lead: editLead.id } as never })}
            onInvoices={() => void navigate({ to: "/invoices", search: { lead: editLead.id } as never })}
            onSave={(patch) => { updateLead(editLead.id, patch); setEditLead(null); toast.success("Сохранено"); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function NewLeadDialog({ managers, defaultManager, onCreate }: {
  managers: string[]; defaultManager: string; onCreate: (l: any) => void;
}) {
  const [f, setF] = useState({
    name: "", phone: "", tg: "", income: "", request: "", tariff: TARIFFS[0] as string, sum: 0, manager: defaultManager,
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новая заявка</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Field label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Telegram"><Input value={f.tg} onChange={(e) => setF({ ...f, tg: e.target.value })} /></Field>
        </div>
        <Field label="Доход"><Input value={f.income} onChange={(e) => setF({ ...f, income: e.target.value })} /></Field>
        <Field label="Запрос"><Textarea value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тариф">
            <Select value={f.tariff} onValueChange={(value) => setF({ ...f, tariff: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TARIFFS.map((tariff) => <SelectItem key={tariff} value={tariff}>{tariff}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Сумма"><Input type="number" value={f.sum} onChange={(e) => setF({ ...f, sum: +e.target.value })} /></Field>
        </div>
        <Field label="Менеджер">
          <Select value={f.manager} onValueChange={(v) => setF({ ...f, manager: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Button className="w-full" onClick={() => onCreate({
          ...f, date: new Date().toISOString().slice(0, 10),
          status: "new", raw_status: "", net: 0, payment: "", payDate: "", comment: "",
        })}>Создать</Button>
      </div>
    </DialogContent>
  );
}

function EditLeadDialog({ lead, managers, onSave, onChat, onInvoices }: {
  lead: Lead; managers: string[]; onSave: (p: Partial<Lead>) => void; onChat: () => void; onInvoices: () => void;
}) {
  const [f, setF] = useState(lead);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Заявка: {lead.name}</DialogTitle></DialogHeader>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto">
        <Field label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Telegram"><Input value={f.tg} onChange={(e) => setF({ ...f, tg: e.target.value })} /></Field>
        </div>
        <Field label="Статус">
          <Select value={f.status} onValueChange={(v: any) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тариф">
            <Select value={f.tariff} onValueChange={(value) => setF({ ...f, tariff: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from(new Set([...TARIFFS, f.tariff])).filter(Boolean).map((tariff) => <SelectItem key={tariff} value={tariff}>{tariff}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Сумма"><Input type="number" value={f.sum} onChange={(e) => setF({ ...f, sum: +e.target.value })} /></Field>
        </div>
        <Field label="Запрос"><Textarea value={f.request} onChange={(e) => setF({ ...f, request: e.target.value })} /></Field>
        <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field>
        <Field label="Менеджер">
          <Select value={f.manager} onValueChange={(v) => setF({ ...f, manager: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onChat}><MessageCircle className="w-4 h-4 mr-2" />Telegram-чат</Button>
          <Button variant="outline" onClick={onInvoices}><ReceiptText className="w-4 h-4 mr-2" />Счета</Button>
          <Button className="col-span-2" onClick={() => onSave(f)}>Сохранить</Button>
        </div>
      </div>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
