import { Link, useRouter } from "@tanstack/react-router";
import { useCrm } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutGrid, Wallet, BarChart3, Users, User as UserIcon } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { currentUser, logout } = useCrm();
  const router = useRouter();

  const nav =
    currentUser?.role === "admin"
      ? [
          { to: "/kanban", label: "Заявки", icon: LayoutGrid },
          { to: "/payments", label: "Оплаты", icon: Wallet },
          { to: "/dashboard", label: "Дашборд", icon: BarChart3 },
          { to: "/employees", label: "Сотрудники", icon: Users },
        ]
      : [
          { to: "/desktop", label: "Рабочий стол", icon: UserIcon },
          { to: "/kanban", label: "Мои заявки", icon: LayoutGrid },
          { to: "/payments", label: "Мои оплаты", icon: Wallet },
        ];

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b bg-card shrink-0 z-40">
        <div className="max-w-[1600px] mx-auto flex items-center gap-6 px-6 h-14">
          <div className="font-bold text-lg tracking-tight">
            Finance<span className="text-primary">CRM</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2 text-muted-foreground [&.active]:bg-accent [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-sm text-right leading-tight">
              <div className="font-medium">{currentUser?.name}</div>
              <div className="text-xs text-muted-foreground">
                {currentUser?.role === "admin" ? "Руководитель" : "Менеджер"}
              </div>
            </div>
            <Button
              variant="ghost" size="icon"
              onClick={() => { logout(); router.navigate({ to: "/auth" }); }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full p-6">{children}</div>
      </main>
    </div>
  );
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { currentUser } = useCrm();
  const router = useRouter();
  if (typeof window === "undefined") return null;
  if (!currentUser) { router.navigate({ to: "/auth" }); return null; }
  if (admin && currentUser.role !== "admin") { router.navigate({ to: "/kanban" }); return null; }
  return <AppShell>{children}</AppShell>;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + " ₽";
}

// Chart colors — plain hex so Recharts can render (project uses oklch tokens)
export const CHART = {
  primary: "#0f172a",
  accent: "#3b82f6",
  muted: "#94a3b8",
  soft: "#cbd5e1",
  good: "#16a34a",
  warn: "#f59e0b",
  bad: "#ef4444",
};
