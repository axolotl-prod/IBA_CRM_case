import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, calcBonus, STATUS_LABELS } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/desktop")({
  ssr: false,
  component: () => (<RequireAuth><Desktop /></RequireAuth>),
});

function Desktop() {
  const { currentUser, visibleLeads, visiblePayments } = useCrm();
  if (!currentUser) return null;
  const leads = visibleLeads();
  const pays = visiblePayments();
  const today = new Date().toISOString().slice(0, 10);
  const todays = leads.filter((l) => l.date === today);
  const active = leads.filter((l) => l.status !== "paid" && l.status !== "closed");

  const net = pays.reduce((s, p) => s + (p.net || 0), 0);
  const b = calcBonus(currentUser, net);

  const nextTarget = net < currentUser.minPlan ? currentUser.minPlan
    : net < currentUser.targetPlan ? currentUser.targetPlan : null;
  const toNext = nextTarget ? nextTarget - net : 0;
  const minPct = Math.min(100, (net / currentUser.minPlan) * 100);
  const tgtPct = Math.min(100, (net / currentUser.targetPlan) * 100);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Рабочий стол — {currentUser.name}</h1>
        <p className="text-sm text-muted-foreground">Ваша сводка на сегодня</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Оклад</div>
          <div className="text-2xl font-bold">{fmtMoney(currentUser.salary)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Премия сейчас</div>
          <div className="text-2xl font-bold">{fmtMoney(b.bonus)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            База {fmtMoney(b.base)} × {b.mult} ({b.tier})
          </div>
        </Card>
        <Card className="p-5 bg-primary/5 border-primary/30">
          <div className="text-sm text-muted-foreground">К выплате</div>
          <div className="text-3xl font-bold text-primary">{fmtMoney(b.total)}</div>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <div className="font-semibold mb-4">Прогресс по плану</div>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>План-минимум · {fmtMoney(currentUser.minPlan)} · ×{currentUser.minMultiplier}</span>
              <span className="font-medium">{fmtMoney(net)} / {Math.round(minPct)}%</span>
            </div>
            <Progress value={minPct} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>План целевой · {fmtMoney(currentUser.targetPlan)} · ×{currentUser.targetMultiplier}</span>
              <span className="font-medium">{fmtMoney(net)} / {Math.round(tgtPct)}%</span>
            </div>
            <Progress value={tgtPct} />
          </div>
          {nextTarget && (
            <div className="text-sm text-muted-foreground">
              До повышающего коэффициента осталось: <b className="text-foreground">{fmtMoney(toNext)}</b>
            </div>
          )}
          {!nextTarget && (
            <div className="text-sm text-primary font-semibold">🎉 Целевой план выполнен!</div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="font-semibold mb-3">Заявки на сегодня ({todays.length})</div>
          {todays.length === 0 && <div className="text-sm text-muted-foreground">Пока ничего</div>}
          <div className="space-y-2">
            {todays.map((l) => (
              <div key={l.id} className="flex justify-between items-center p-2 rounded border text-sm">
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1">{l.request}</div>
                </div>
                <Badge variant="secondary">{STATUS_LABELS[l.status]}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="font-semibold mb-3">В работе ({active.length})</div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {active.slice(0, 20).map((l) => (
              <div key={l.id} className="flex justify-between items-center p-2 rounded border text-sm">
                <div className="font-medium">{l.name}</div>
                <Badge variant="outline">{STATUS_LABELS[l.status]}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
