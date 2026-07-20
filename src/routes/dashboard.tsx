import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { RequireAuth, fmtMoney } from "@/components/AppShell";
import { useCrm, calcBonus } from "@/lib/crm-store";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: () => (<RequireAuth admin><Dashboard /></RequireAuth>),
});

function Dashboard() {
  const { state } = useCrm();
  const { payments, users } = state;

  const managers = users.filter((u) => u.role === "manager");

  const perManager = managers.map((m) => {
    const own = payments.filter((p) => p.manager === m.name);
    const revenue = own.reduce((s, p) => s + (p.revenue || 0), 0);
    const net = own.reduce((s, p) => s + (p.net || 0), 0);
    const bonus = calcBonus(m, net);
    return { user: m, revenue, net, bonus, count: own.length };
  });

  const totalNet = perManager.reduce((s, x) => s + x.net, 0);
  const totalTarget = managers.reduce((s, m) => s + m.targetPlan, 0);
  const totalMin = managers.reduce((s, m) => s + m.minPlan, 0);

  const dynamics = useMemo(() => {
    const byDate: Record<string, number> = {};
    payments.forEach((p) => {
      if (!p.date) return;
      byDate[p.date] = (byDate[p.date] || 0) + (p.net || 0);
    });
    const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
    let acc = 0;
    return sorted.map(([date, v]) => ({ date, day: v, total: (acc += v) }));
  }, [payments]);

  const chartCompare = perManager.map((m) => ({
    name: m.user.name,
    Факт: m.net,
    "План мин": m.user.minPlan,
    "План цель": m.user.targetPlan,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Дашборд</h1>
        <p className="text-sm text-muted-foreground">Сводка по компании и планам менеджеров</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Чистая прибыль</div>
          <div className="text-3xl font-bold mt-1">{fmtMoney(totalNet)}</div>
          <div className="mt-3 space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>План-минимум</span>
                <span>{Math.round((totalNet / totalMin) * 100 || 0)}%</span>
              </div>
              <Progress value={Math.min(100, (totalNet / totalMin) * 100)} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>План целевой</span>
                <span>{Math.round((totalNet / totalTarget) * 100 || 0)}%</span>
              </div>
              <Progress value={Math.min(100, (totalNet / totalTarget) * 100)} />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Оплаты</div>
          <div className="text-3xl font-bold mt-1">{payments.length}</div>
          <div className="text-xs text-muted-foreground mt-2">
            Средний чек: {fmtMoney(payments.length ? totalNet / payments.length : 0)}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Фонд премий (текущий)</div>
          <div className="text-3xl font-bold mt-1">
            {fmtMoney(perManager.reduce((s, m) => s + m.bonus.bonus, 0))}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            + оклады: {fmtMoney(managers.reduce((s, m) => s + m.salary, 0))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="font-semibold mb-4">Динамика поступления денег</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dynamics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} name="Накопленно" dot={false} />
              <Line type="monotone" dataKey="day" stroke="#94a3b8" name="За день" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <div className="font-semibold mb-4">План vs Факт по менеджерам</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartCompare}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Факт" fill="hsl(var(--primary))" />
              <Bar dataKey="План мин" fill="#94a3b8" />
              <Bar dataKey="План цель" fill="#cbd5e1" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <div className="font-semibold mb-4">По сотрудникам</div>
        <div className="space-y-4">
          {perManager.map((m) => {
            const minPct = Math.min(100, (m.net / m.user.minPlan) * 100);
            const tgtPct = Math.min(100, (m.net / m.user.targetPlan) * 100);
            const toNext =
              m.net < m.user.minPlan ? m.user.minPlan - m.net :
              m.net < m.user.targetPlan ? m.user.targetPlan - m.net : 0;
            return (
              <div key={m.user.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{m.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.count} оплат · выручка {fmtMoney(m.revenue)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={m.bonus.mult > 1 ? "default" : "secondary"}>
                      {m.bonus.tier} · ×{m.bonus.mult}
                    </Badge>
                    <div className="text-sm mt-1">
                      К выплате: <span className="font-bold">{fmtMoney(m.bonus.total)}</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>План-мин: {fmtMoney(m.user.minPlan)}</span>
                      <span>{Math.round(minPct)}%</span>
                    </div>
                    <Progress value={minPct} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Цель: {fmtMoney(m.user.targetPlan)}</span>
                      <span>{Math.round(tgtPct)}%</span>
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
