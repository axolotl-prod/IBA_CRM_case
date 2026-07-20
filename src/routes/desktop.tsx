import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, calcBonus, STATUS_LABELS, monthLabel } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/desktop")({
  ssr: false,
  component: () => (<RequireAuth><Desktop /></RequireAuth>),
});

function Desktop() {
  const { currentUser, visibleLeads, planFor, paymentsForMonth, state, availableMonths, setMonth } = useCrm();
  const router = useRouter();
  if (!currentUser) return null;

  const month = state.currentMonth;
  const plan = planFor(currentUser.id, month);
  const pays = paymentsForMonth(month, currentUser.name);
  const net = pays.reduce((s, p) => s + (p.net || 0), 0);
  const b = calcBonus(plan, net);

  const leads = visibleLeads();
  const active = leads.filter((l) => l.status !== "paid" && l.status !== "closed");

  const nextThreshold =
    net < plan.minPlan ? { name: "План-минимум", target: plan.minPlan, mult: plan.minMultiplier } :
    net < plan.targetPlan ? { name: "Целевой план", target: plan.targetPlan, mult: plan.targetMultiplier } :
    net < plan.maxPlan ? { name: "Максимум", target: plan.maxPlan, mult: plan.maxMultiplier } : null;

  const toNext = nextThreshold ? nextThreshold.target - net : 0;
  const currentPct = nextThreshold ? Math.round((net / nextThreshold.target) * 100) : 100;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Рабочий стол — {currentUser.name}</h1>
          <p className="text-sm text-muted-foreground">Ваши показатели и заявки в работе</p>
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {availableMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Bonus card — main focus */}
        <Card className="p-5 lg:col-span-2 flex flex-col bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Ваша премия сейчас</div>
              <div className="text-5xl font-bold text-primary mt-1">{fmtMoney(b.bonus)}</div>
              <div className="text-sm mt-2">
                <Badge variant={b.mult > 1 ? "default" : "secondary"}>{b.tier} · ×{b.mult}</Badge>
                <span className="ml-2 text-muted-foreground">
                  {plan.bonusRate}% × {fmtMoney(net)} × {b.mult}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">К выплате всего</div>
              <div className="text-2xl font-bold">{fmtMoney(b.total)}</div>
              <div className="text-xs text-muted-foreground">оклад {fmtMoney(plan.salary)}</div>
            </div>
          </div>

          <div className="flex-1 min-h-0 space-y-4 pt-2">
            {nextThreshold ? (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>До «{nextThreshold.name}» (×{nextThreshold.mult})</span>
                  <span className="font-semibold">{fmtMoney(toNext)}</span>
                </div>
                <Progress value={currentPct} />
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtMoney(net)} / {fmtMoney(nextThreshold.target)} · {currentPct}%
                </div>
              </div>
            ) : (
              <div className="text-primary font-semibold">🎉 Максимум выполнен!</div>
            )}

            <div className="grid grid-cols-3 gap-3 text-sm">
              <PlanTier label="Мин" value={plan.minPlan} net={net} mult={plan.minMultiplier} />
              <PlanTier label="Цель" value={plan.targetPlan} net={net} mult={plan.targetMultiplier} />
              <PlanTier label="Макс" value={plan.maxPlan} net={net} mult={plan.maxMultiplier} />
            </div>
          </div>
        </Card>

        {/* Leads in work — clickable */}
        <Card className="p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="font-semibold">В работе ({active.length})</div>
            <button
              onClick={() => router.navigate({ to: "/kanban" })}
              className="text-xs text-primary hover:underline"
            >
              Открыть доску →
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {active.length === 0 && (
              <div className="text-sm text-muted-foreground">Нет активных заявок</div>
            )}
            {active.map((l) => (
              <button
                key={l.id}
                onClick={() => router.navigate({ to: "/kanban" })}
                className="w-full text-left p-2 rounded border hover:border-primary hover:bg-accent/40 transition"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium text-sm">{l.name}</div>
                  <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[l.status]}</Badge>
                </div>
                {l.tariff && <div className="text-xs text-muted-foreground mt-0.5">{l.tariff}</div>}
                {l.request && <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{l.request}</div>}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PlanTier({ label, value, net, mult }: { label: string; value: number; net: number; mult: number }) {
  const done = value > 0 && net >= value;
  return (
    <div className={`rounded-lg border p-2 ${done ? "bg-primary/10 border-primary/40" : "bg-background"}`}>
      <div className="text-xs text-muted-foreground">{label} ×{mult}</div>
      <div className={`text-sm font-semibold ${done ? "text-primary" : ""}`}>{fmtMoney(value)}</div>
    </div>
  );
}
