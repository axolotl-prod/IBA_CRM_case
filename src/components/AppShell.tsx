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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-40">
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
              variant="ghost"
              size="icon"
              onClick={() => {
                logout();
                router.navigate({ to: "/auth" });
              }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto p-6">{children}</main>
    </div>
  );
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { currentUser } = useCrm();
  const router = useRouter();
  if (typeof window === "undefined") return null;
  if (!currentUser) {
    router.navigate({ to: "/auth" });
    return null;
  }
  if (admin && currentUser.role !== "admin") {
    router.navigate({ to: "/kanban" });
    return null;
  }
  return <AppShell>{children}</AppShell>;
}

export function fmtMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n || 0) + " ₽";
}
