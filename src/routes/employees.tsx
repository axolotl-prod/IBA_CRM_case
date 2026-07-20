import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, calcBonus, type User } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/employees")({
  ssr: false,
  component: () => (<RequireAuth admin><Employees /></RequireAuth>),
});

function empty(): User {
  return {
    id: `u_${Date.now()}`,
    login: "", password: "", name: "", role: "manager",
    salary: 50000, bonusRate: 8,
    minPlan: 1000000, targetPlan: 1500000,
    minMultiplier: 1.2, targetMultiplier: 1.5,
  };
}

function Employees() {
  const { state, upsertUser, removeUser } = useCrm();
  const [edit, setEdit] = useState<User | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">Оклады, ставки и планы</p>
        </div>
        <Button onClick={() => setEdit(empty())}>
          <Plus className="w-4 h-4 mr-2" />Новый сотрудник
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.users.map((u) => {
          const net = state.payments
            .filter((p) => p.manager === u.name)
            .reduce((s, p) => s + (p.net || 0), 0);
          const b = calcBonus(u, net);
          return (
            <Card key={u.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold">{u.name}</div>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Руководитель" : "Менеджер"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Логин: {u.login}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEdit(u)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Удалить ${u.name}?`)) {
                        removeUser(u.id);
                        toast.success("Удалён");
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Оклад" v={fmtMoney(u.salary)} />
                <Info label="Ставка %" v={`${u.bonusRate}%`} />
                <Info label="План-мин" v={fmtMoney(u.minPlan)} />
                <Info label="План цель" v={fmtMoney(u.targetPlan)} />
                <Info label="×мин" v={`×${u.minMultiplier}`} />
                <Info label="×цель" v={`×${u.targetMultiplier}`} />
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-2">Текущий расчёт</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Факт: <b>{fmtMoney(net)}</b></div>
                  <div>Уровень: <Badge variant="outline">{b.tier}</Badge></div>
                  <div>База премии: {fmtMoney(b.base)}</div>
                  <div>Коэф: ×{b.mult}</div>
                  <div>Премия: <b>{fmtMoney(b.bonus)}</b></div>
                  <div className="text-primary font-bold">К выплате: {fmtMoney(b.total)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        {edit && (
          <EditDialog
            user={edit}
            onSave={(u) => {
              upsertUser(u);
              setEdit(null);
              toast.success("Сохранено");
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function Info({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function EditDialog({ user, onSave }: { user: User; onSave: (u: User) => void }) {
  const [f, setF] = useState<User>(user);
  const preview = calcBonus(f, f.targetPlan);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{user.name ? `Сотрудник: ${user.name}` : "Новый сотрудник"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <F label="Имя"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></F>
          <F label="Роль">
            <Select value={f.role} onValueChange={(v: any) => setF({ ...f, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Менеджер</SelectItem>
                <SelectItem value="admin">Руководитель</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Логин"><Input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} /></F>
          <F label="Пароль"><Input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Оклад (₽)"><Input type="number" value={f.salary} onChange={(e) => setF({ ...f, salary: +e.target.value })} /></F>
          <F label="Базовая ставка (%)"><Input type="number" value={f.bonusRate} onChange={(e) => setF({ ...f, bonusRate: +e.target.value })} /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="План-минимум"><Input type="number" value={f.minPlan} onChange={(e) => setF({ ...f, minPlan: +e.target.value })} /></F>
          <F label="План целевой"><Input type="number" value={f.targetPlan} onChange={(e) => setF({ ...f, targetPlan: +e.target.value })} /></F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label="Коэф. при мин"><Input type="number" step="0.1" value={f.minMultiplier} onChange={(e) => setF({ ...f, minMultiplier: +e.target.value })} /></F>
          <F label="Коэф. при цели"><Input type="number" step="0.1" value={f.targetMultiplier} onChange={(e) => setF({ ...f, targetMultiplier: +e.target.value })} /></F>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-1">Прогноз при выполнении целевого плана</div>
          <div className="text-sm">
            Премия: <b>{fmtMoney(preview.bonus)}</b> · К выплате: <b className="text-primary">{fmtMoney(preview.total)}</b>
          </div>
        </div>
        <Button className="w-full" onClick={() => onSave(f)}>Сохранить</Button>
      </div>
    </DialogContent>
  );
}

function F({ label, children }: any) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
