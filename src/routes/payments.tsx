import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, Wallet, Users, ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/payments")({
  ssr: false,
  component: () => (<RequireAuth><Payments /></RequireAuth>),
});

const ALL = "__all__";
type SortKey = "order" | "name" | "tariff" | "revenue" | "net" | "payment" | "date" | "manager";

function Payments() {
  const { visiblePayments, addPayment, state, currentUser } = useCrm();
  const all = visiblePayments();
  const [open, setOpen] = useState(false);

  const [fManager, setFManager] = useState(ALL);
  const [fTariff, setFTariff] = useState(ALL);
  const [fMethod, setFMethod] = useState(ALL);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const managers = state.users.map((u) => u.name);
  const tariffs = useMemo(() => Array.from(new Set(all.map((p) => p.tariff).filter(Boolean))).sort(), [all]);
  const methods = useMemo(() => Array.from(new Set(all.map((p) => p.payment).filter(Boolean))).sort(), [all]);

  const filtered = useMemo(() => {
    let list = all.filter((p) => {
      if (fManager !== ALL && p.manager !== fManager) return false;
      if (fTariff !== ALL && p.tariff !== fTariff) return false;
      if (fMethod !== ALL && p.payment !== fMethod) return false;
      if (q && !`${p.name} ${p.tariff} ${p.manager}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    list = list.slice().sort((a, b) => {
      const av = a[sortKey] as any; const bv = b[sortKey] as any;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const s = String(av || "").localeCompare(String(bv || ""));
      return sortDir === "asc" ? s : -s;
    });
    return list;
  }, [all, fManager, fTariff, fMethod, q, sortKey, sortDir]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, p) => s + (p.revenue || 0), 0);
    const net = filtered.reduce((s, p) => s + (p.net || 0), 0);
    const clients = new Set(filtered.map((p) => p.name)).size;
    const avg = filtered.length ? revenue / filtered.length : 0;
    return { revenue, net, clients, avg };
  }, [filtered]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const hasFilter = fManager !== ALL || fTariff !== ALL || fMethod !== ALL || q;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Оплаты</h1>
          <p className="text-sm text-muted-foreground">
            {currentUser?.role === "admin" ? "Все оплаты" : "Ваши оплаты"} · показано {filtered.length} из {all.length}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Внести оплату</Button></DialogTrigger>
          <NewPaymentDialog
            managers={managers}
            defaultManager={currentUser?.name || "Вася"}
            onCreate={(p: any) => { addPayment(p); setOpen(false); toast.success("Оплата добавлена"); }}
          />
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 shrink-0">
        <StatCard icon={TrendingUp} label="Выручка" value={fmtMoney(totals.revenue)} />
        <StatCard icon={Wallet} label="Чистая прибыль" value={fmtMoney(totals.net)} />
        <StatCard icon={Users} label="Клиентов" value={String(totals.clients)} />
        <StatCard icon={TrendingUp} label="Средний чек" value={fmtMoney(totals.avg)} />
      </div>

      <div className="flex items-center gap-2 mb-3 shrink-0 flex-wrap">
        <Input placeholder="Поиск..." value={q} onChange={(e) => setQ(e.target.value)} className="w-48" />
        {currentUser?.role === "admin" && (
          <Select value={fManager} onValueChange={setFManager}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Менеджер" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все менеджеры</SelectItem>
              {managers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={fTariff} onValueChange={setFTariff}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Тариф" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все тарифы</SelectItem>
            {tariffs.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fMethod} onValueChange={setFMethod}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Способ оплаты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все способы</SelectItem>
            {methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={() => { setFManager(ALL); setFTariff(ALL); setFMethod(ALL); setQ(""); }}>
            <X className="w-4 h-4 mr-1" />Сбросить
          </Button>
        )}
      </div>

      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col p-0">
        <div className="flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <SortableTh label="№" k="order" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Клиент" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Тариф" k="tariff" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Выручка" k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableTh label="Чистыми" k="net" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="text-right" />
                <SortableTh label="Способ" k="payment" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Дата" k="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Менеджер" k="manager" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.order}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.tariff}</TableCell>
                  <TableCell className="text-right">{fmtMoney(p.revenue)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(p.net)}</TableCell>
                  <TableCell>{p.payment}</TableCell>
                  <TableCell>{p.date}</TableCell>
                  <TableCell>{p.manager}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SortableTh({ label, k, sortKey, sortDir, onClick, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition ${active ? "text-foreground font-semibold" : ""}`}
      >
        {label}
        <Icon className="w-3 h-3 opacity-60" />
      </button>
    </TableHead>
  );
}

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-base font-bold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function NewPaymentDialog({ managers, defaultManager, onCreate }: any) {
  const [f, setF] = useState({
    name: "", contact: "", tariff: "куратор",
    revenue: 0, net: 0, debt: 0, payment: "сразу",
    date: new Date().toISOString().slice(0, 10), manager: defaultManager, schedule: "",
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Новая оплата</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <F label="Клиент"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></F>
        <F label="Контакт (тг/тел)"><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></F>
        <F label="Тариф"><Input value={f.tariff} onChange={(e) => setF({ ...f, tariff: e.target.value })} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Выручка"><Input type="number" value={f.revenue} onChange={(e) => setF({ ...f, revenue: +e.target.value, net: Math.round(+e.target.value * 0.85) })} /></F>
          <F label="Чистыми"><Input type="number" value={f.net} onChange={(e) => setF({ ...f, net: +e.target.value })} /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Способ"><Input value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} /></F>
          <F label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></F>
        </div>
        <F label="Менеджер">
          <Select value={f.manager} onValueChange={(v) => setF({ ...f, manager: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {managers.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <Button className="w-full" onClick={() => onCreate(f)}>Добавить</Button>
      </div>
    </DialogContent>
  );
}

function F({ label, children }: any) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
