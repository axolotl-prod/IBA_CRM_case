import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { RequireAuth, fmtMoney, CHART } from "@/components/AppShell";
import { useCrm, calcBonus, monthLabel } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: () => (<RequireAuth admin><Dashboard /></RequireAuth>),
});

function Dashboard() {
  const { state, availableMonths, setMonth, planFor, paymentsForMonth } = useCrm();
  const { users } = state;
  const month = state.currentMonth;

  const managers = users.filter((u) => u.role === "manager");
  const monthPayments = paymentsForMonth(month);

  const perManager = managers.map((m) => {
    const own = monthPayments.filter((p) => p.manager === m.name);
    const revenue = own.reduce((s, p) => s + (p.revenue || 0), 0);
    const net = own.reduce((s, p) => s + (p.net || 0), 0);
    const plan = planFor(m.id, month);
    const bonus = calcBonus(plan, net);
    return { user: m, plan, revenue, net, bonus, count: own.length };
  });

  const totalNet = monthPayments.reduce((s, p) => s + (p.net || 0), 0);
  const totalRevenue = monthPayments.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalTarget = perManager.reduce((s, x) => s + x.plan.targetPlan, 0);
  const totalMin = perManager.reduce((s, x) => s + x.plan.minPlan, 0);
  const totalSalary = perManager.reduce((s, x) => s + x.plan.salary, 0);
  const totalBonus = perManager.reduce((s, x) => s + x.bonus.bonus, 0);

  const dynamics = useMemo(() => {
    const byDate: Record<string, number> = {};
    monthPayments.forEach((p) => { if (p.date) byDate[p.date] = (byDate[p.date] || 0) + (p.net || 0); });
    const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
    let acc = 0;
    return sorted.map(([date, v]) => ({ date: date.slice(5), day: v, total: (acc += v) }));
  }, [monthPayments]);

  const chartCompare = perManager.map((m) => ({
    name: m.user.name,
    Факт: m.net,
    "План мин": m.plan.minPlan,
    "План цель": m.plan.targetPlan,
  }));

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Дашборд</h1>
          <p className="text-sm text-muted-foreground">Сводка и планы менеджеров</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Месяц:</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {availableMonths.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Выручка</div>
          <div className="text-2xl font-bold">{fmtMoney(totalRevenue)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Чистая прибыль</div>
          <div className="text-2xl font-bold">{fmtMoney(totalNet)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Оплат / средний чек</div>
          <div className="text-2xl font-bold">{monthPayments.length}</div>
          <div className="text-xs text-muted-foreground">{fmtMoney(monthPayments.length ? totalRevenue / monthPayments.length : 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Фонд ЗП (оклад + премии)</div>
          <div className="text-2xl font-bold">{fmtMoney(totalSalary + totalBonus)}</div>
          <div className="text-xs text-muted-foreground">оклад {fmtMoney(totalSalary)} + премии {fmtMoney(totalBonus)}</div>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="font-semibold mb-3">Прогресс по компании</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>План-минимум · {fmtMoney(totalMin)}</span>
              <span>{Math.round(totalMin ? (totalNet / totalMin) * 100 : 0)}%</span>
            </div>
            <Progress value={Math.min(100, totalMin ? (totalNet / totalMin) * 100 : 0)} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>План целевой · {fmtMoney(totalTarget)}</span>
              <span>{Math.round(totalTarget ? (totalNet / totalTarget) * 100 : 0)}%</span>
            </div>
            <Progress value={Math.min(100, totalTarget ? (totalNet / totalTarget) * 100 : 0)} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <div className="font-semibold mb-3">Динамика поступления денег</div>
          {dynamics.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              Нет данных за месяц
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dynamics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtMoney(v)} />
                <Line type="monotone" dataKey="total" stroke={CHART.accent} strokeWidth={2} name="Накопительно" dot={false} />
                <Line type="monotone" dataKey="day" stroke={CHART.muted} name="За день" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-4">
          <div className="font-semibold mb-3">План vs Факт по менеджерам</div>
          {chartCompare.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">Нет менеджеров</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartCompare}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Факт" fill={CHART.accent} />
                <Bar dataKey="План мин" fill={CHART.muted} />
                <Bar dataKey="План цель" fill={CHART.soft} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="font-semibold mb-3">По сотрудникам</div>
        <div className="space-y-3">
          {perManager.map((m) => {
            const minPct = Math.min(100, m.plan.minPlan ? (m.net / m.plan.minPlan) * 100 : 0);
            const tgtPct = Math.min(100, m.plan.targetPlan ? (m.net / m.plan.targetPlan) * 100 : 0);
            const toNext =
              m.net < m.plan.minPlan ? m.plan.minPlan - m.net :
              m.net < m.plan.targetPlan ? m.plan.targetPlan - m.net :
              m.net < m.plan.maxPlan ? m.plan.maxPlan - m.net : 0;
            return (
              <div key={m.user.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div>
                    <div className="font-semibold">{m.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.count} оплат · выручка {fmtMoney(m.revenue)} · чистая {fmtMoney(m.net)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={m.bonus.mult > 1 ? "default" : "secondary"}>
                      {m.bonus.tier} · ×{m.bonus.mult}
                    </Badge>
                    <div className="text-sm mt-1">
                      К выплате: <span className="font-bold">{fmtMoney(m.bonus.total)}</span>
                      <span className="text-xs text-muted-foreground ml-1">(оклад {fmtMoney(m.plan.salary)} + премия {fmtMoney(m.bonus.bonus)})</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Мин: {fmtMoney(m.plan.minPlan)}</span><span>{Math.round(minPct)}%</span>
                    </div>
                    <Progress value={minPct} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Цель: {fmtMoney(m.plan.targetPlan)}</span><span>{Math.round(tgtPct)}%</span>
                    </div>
                    <Progress value={tgtPct} />
                  </div>
                </div>
                {toNext > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">
                    До следующего уровня: {fmtMoney(toNext)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
