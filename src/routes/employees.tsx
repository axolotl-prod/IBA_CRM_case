import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, type User, type PlanConfig, monthLabel, calcBonus } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employees")({
  ssr: false,
  component: () => (<RequireAuth admin><EmployeesPage /></RequireAuth>),
});

function empty(): User {
  return {
    id: `u_${Date.now()}`,
    login: "", password: "", name: "", role: "manager",
    salary: 50000, bonusRate: 8,
    minPlan: 1000000, targetPlan: 1500000, maxPlan: 2000000,
    minMultiplier: 1.2, targetMultiplier: 1.5, maxMultiplier: 2.0,
  };
}

function EmployeesPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold">Управление командой</h1>
        <p className="text-sm text-muted-foreground">Планы по месяцам и параметры сотрудников</p>
      </div>
      <Tabs defaultValue="plans" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="shrink-0 self-start">
          <TabsTrigger value="plans">Планы по месяцам</TabsTrigger>
          <TabsTrigger value="employees">Сотрудники</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="flex-1 min-h-0 overflow-y-auto mt-3">
          <PlansTab />
        </TabsContent>
        <TabsContent value="employees" className="flex-1 min-h-0 overflow-y-auto mt-3">
          <EmployeesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------- Планы по месяцам ------------- */

function PlansTab() {
  const { state, availableMonths, setMonth, planFor, setMonthlyPlan } = useCrm();
  const month = state.currentMonth;

  // include current month even if no data
  const monthOptions = Array.from(new Set([...availableMonths, month])).sort();

  const rows = state.users.map((u) => ({ user: u, plan: planFor(u.id, month) }));

  const onField = (userId: string, key: keyof PlanConfig, v: number) => {
    const cur = planFor(userId, month);
    setMonthlyPlan(userId, month, { ...cur, [key]: v });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Месяц:</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          Значения по месяцу переопределяют базовые. Пустой месяц = базовые из карточки сотрудника.
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead className="text-right">Оклад</TableHead>
                <TableHead className="text-right">Ставка %</TableHead>
                <TableHead className="text-right">План мин</TableHead>
                <TableHead className="text-right">План цель</TableHead>
                <TableHead className="text-right">План макс</TableHead>
                <TableHead className="text-right">×мин</TableHead>
                <TableHead className="text-right">×цель</TableHead>
                <TableHead className="text-right">×макс</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ user, plan }) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {user.name}
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {user.role === "admin" ? "Рук" : "Мнг"}
                    </Badge>
                  </TableCell>
                  <NumCell v={plan.salary} onChange={(x) => onField(user.id, "salary", x)} />
                  <NumCell v={plan.bonusRate} onChange={(x) => onField(user.id, "bonusRate", x)} step={0.5} />
                  <NumCell v={plan.minPlan} onChange={(x) => onField(user.id, "minPlan", x)} />
                  <NumCell v={plan.targetPlan} onChange={(x) => onField(user.id, "targetPlan", x)} />
                  <NumCell v={plan.maxPlan} onChange={(x) => onField(user.id, "maxPlan", x)} />
                  <NumCell v={plan.minMultiplier} onChange={(x) => onField(user.id, "minMultiplier", x)} step={0.1} />
                  <NumCell v={plan.targetMultiplier} onChange={(x) => onField(user.id, "targetMultiplier", x)} step={0.1} />
                  <NumCell v={plan.maxMultiplier} onChange={(x) => onField(user.id, "maxMultiplier", x)} step={0.1} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

    </div>
  );
}

function NumCell({ v, onChange, step = 1 }: { v: number; onChange: (n: number) => void; step?: number }) {
  return (
    <TableCell className="text-right">
      <Input
        type="number" step={step} value={v}
        onChange={(e) => onChange(+e.target.value)}
        className="h-8 text-right w-28 ml-auto"
      />
    </TableCell>
  );
}

/* ------------- Сотрудники + история ------------- */

function EmployeesTab() {
  const { state, upsertUser, removeUser, planHistory } = useCrm();
  const [edit, setEdit] = useState<User | null>(null);
  const [history, setHistory] = useState<User | null>(null);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button onClick={() => setEdit(empty())}>
          <Plus className="w-4 h-4 mr-2" />Новый сотрудник
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {state.users.map((u) => {
          const net = state.payments.filter((p) => p.manager === u.name).reduce((s, p) => s + (p.net || 0), 0);
          const b = calcBonus(u, net);
          return (
            <Card key={u.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold">{u.name || "—"}</div>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Руководитель" : "Менеджер"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Логин: {u.login}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setHistory(u)} title="История">
                    <History className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEdit(u)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (confirm(`Удалить ${u.name}?`)) { removeUser(u.id); toast.success("Удалён"); }
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Info label="Оклад" v={fmtMoney(u.salary)} />
                <Info label="Ставка" v={`${u.bonusRate}%`} />
                <Info label="Всего чист." v={fmtMoney(net)} />
                <Info label="Мин" v={fmtMoney(u.minPlan)} />
                <Info label="Цель" v={fmtMoney(u.targetPlan)} />
                <Info label="Макс" v={fmtMoney(u.maxPlan)} />
              </div>
              <div className="mt-3 pt-3 border-t text-sm flex items-center justify-between">
                <div>Всего: <b>{fmtMoney(b.total)}</b></div>
                <Badge variant="outline">{b.tier}</Badge>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && <EditDialog user={edit} onSave={(u) => { upsertUser(u); setEdit(null); toast.success("Сохранено"); }} />}
      </Dialog>

      <Dialog open={!!history} onOpenChange={(o) => !o && setHistory(null)}>
        {history && <HistoryDialog user={history} history={planHistory(history.id)} />}
      </Dialog>
    </div>
  );
}

function HistoryDialog({ user, history }: { user: User; history: Array<{ month: string; plan: PlanConfig }> }) {
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>История: {user.name}</DialogTitle></DialogHeader>
      {history.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          Пока нет переопределений по месяцам. Настройте план во вкладке «Планы по месяцам».
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месяц</TableHead>
                <TableHead className="text-right">Оклад</TableHead>
                <TableHead className="text-right">Ставка</TableHead>
                <TableHead className="text-right">Мин</TableHead>
                <TableHead className="text-right">Цель</TableHead>
                <TableHead className="text-right">Макс</TableHead>
                <TableHead className="text-right">×</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(({ month, plan }) => (
                <TableRow key={month}>
                  <TableCell className="font-medium">{monthLabel(month)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(plan.salary)}</TableCell>
                  <TableCell className="text-right">{plan.bonusRate}%</TableCell>
                  <TableCell className="text-right">{fmtMoney(plan.minPlan)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(plan.targetPlan)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(plan.maxPlan)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {plan.minMultiplier}/{plan.targetMultiplier}/{plan.maxMultiplier}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </DialogContent>
  );
}

function Info({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function EditDialog({ user, onSave }: { user: User; onSave: (u: User) => void }) {
  const [f, setF] = useState<User>(user);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{user.name ? `Сотрудник: ${user.name}` : "Новый сотрудник"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Fld>
          <Fld label="Роль">
            <Select value={f.role} onValueChange={(v: any) => setF({ ...f, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Менеджер</SelectItem>
                <SelectItem value="admin">Руководитель</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Логин"><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} /></Fld>
          <Fld label="Пароль"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Fld>
        </div>
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Базовые значения (применяются к любому месяцу без переопределения):
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Fld label="Оклад (₽)"><Input type="number" value={f.salary} onChange={(e) => setF({ ...f, salary: +e.target.value })} /></Fld>
          <Fld label="Базовая ставка (%)"><Input type="number" step="0.5" value={f.bonusRate} onChange={(e) => setF({ ...f, bonusRate: +e.target.value })} /></Fld>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Fld label="План-мин"><Input type="number" value={f.minPlan} onChange={(e) => setF({ ...f, minPlan: +e.target.value })} /></Fld>
          <Fld label="План цель"><Input type="number" value={f.targetPlan} onChange={(e) => setF({ ...f, targetPlan: +e.target.value })} /></Fld>
          <Fld label="План макс"><Input type="number" value={f.maxPlan} onChange={(e) => setF({ ...f, maxPlan: +e.target.value })} /></Fld>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Fld label="×мин"><Input type="number" step="0.1" value={f.minMultiplier} onChange={(e) => setF({ ...f, minMultiplier: +e.target.value })} /></Fld>
          <Fld label="×цель"><Input type="number" step="0.1" value={f.targetMultiplier} onChange={(e) => setF({ ...f, targetMultiplier: +e.target.value })} /></Fld>
          <Fld label="×макс"><Input type="number" step="0.1" value={f.maxMultiplier} onChange={(e) => setF({ ...f, maxMultiplier: +e.target.value })} /></Fld>
        </div>
        <Button className="w-full" onClick={() => onSave(f)}>Сохранить</Button>
      </div>
    </DialogContent>
  );
}

function Fld({ label, children }: any) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
