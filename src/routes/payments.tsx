import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, Wallet, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/payments")({
  ssr: false,
  component: () => (<RequireAuth><Payments /></RequireAuth>),
});

function Payments() {
  const { visiblePayments, addPayment, state, currentUser } = useCrm();
  const payments = visiblePayments();
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    const revenue = payments.reduce((s, p) => s + (p.revenue || 0), 0);
    const net = payments.reduce((s, p) => s + (p.net || 0), 0);
    const clients = new Set(payments.map((p) => p.name)).size;
    const avg = payments.length ? revenue / payments.length : 0;
    return { revenue, net, clients, avg };
  }, [payments]);

  const managers = state.users.map((u) => u.name);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Оплаты</h1>
          <p className="text-sm text-muted-foreground">
            {currentUser?.role === "admin" ? "Все оплаты" : "Ваши оплаты"} · {payments.length} записей
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Внести оплату</Button>
          </DialogTrigger>
          <NewPaymentDialog
            managers={managers}
            defaultManager={currentUser?.name || "Вася"}
            onCreate={(p: any) => {
              addPayment(p);
              setOpen(false);
              toast.success("Оплата добавлена");
            }}
          />
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={TrendingUp} label="Выручка" value={fmtMoney(totals.revenue)} />
        <StatCard icon={Wallet} label="Чистая прибыль" value={fmtMoney(totals.net)} />
        <StatCard icon={Users} label="Клиентов" value={String(totals.clients)} />
        <StatCard icon={TrendingUp} label="Средний чек" value={fmtMoney(totals.avg)} />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Тариф</TableHead>
              <TableHead className="text-right">Выручка</TableHead>
              <TableHead className="text-right">Чистыми</TableHead>
              <TableHead>Способ</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Менеджер</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.slice().reverse().map((p) => (
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
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function NewPaymentDialog({ managers, defaultManager, onCreate }: any) {
  const [f, setF] = useState({
    name: "", contact: "", tariff: "куратор",
    revenue: 0, net: 0, debt: 0, payment: "сразу",
    date: new Date().toISOString().slice(0, 10),
    manager: defaultManager, schedule: "",
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
