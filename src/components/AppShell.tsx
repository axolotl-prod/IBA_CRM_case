import { Link, useRouter } from "@tanstack/react-router";
import { useCrm } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { loadTelegramUnreadCount } from "@/lib/telegram-functions";
import { LogOut, LayoutGrid, Wallet, BarChart3, Users, User as UserIcon, Menu, MessageCircle, ReceiptText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { currentUser, logout } = useCrm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    const refresh = () => void loadTelegramUnreadCount({ data: { userId: currentUser.id } }).then(setUnreadChats).catch(() => {});
    refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, [currentUser?.id]);

  const nav =
    currentUser?.role === "admin"
      ? [
          { to: "/kanban", label: "Заявки", icon: LayoutGrid },
          { to: "/chats", label: "Чаты", icon: MessageCircle },
          { to: "/invoices", label: "Счета", icon: ReceiptText },
          { to: "/payments", label: "Оплаты", icon: Wallet },
          { to: "/dashboard", label: "Дашборд", icon: BarChart3 },
          { to: "/employees", label: "Сотрудники", icon: Users },
        ]
      : [
          { to: "/desktop", label: "Рабочий стол", icon: UserIcon },
          { to: "/kanban", label: "Мои заявки", icon: LayoutGrid },
          { to: "/chats", label: "Мои чаты", icon: MessageCircle },
          { to: "/invoices", label: "Мои счета", icon: ReceiptText },
          { to: "/payments", label: "Мои оплаты", icon: Wallet },
        ];

  const handleLogout = () => { logout(); router.navigate({ to: "/auth" }); };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header className="border-b bg-card shrink-0 z-40">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3 md:gap-6 px-3 md:px-6 h-14">
          {/* Mobile burger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Меню</SheetTitle>
              <div className="p-4 border-b">
                <div className="font-bold text-lg tracking-tight">
                  Finance<span className="text-primary">CRM</span>
                </div>
                {currentUser && (
                  <div className="mt-3 text-sm">
                    <div className="font-medium">{currentUser.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {currentUser.role === "admin" ? "Руководитель" : "Менеджер"}
                    </div>
                  </div>
                )}
              </div>
              <nav className="flex flex-col p-2">
                {nav.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setOpen(false)}
                    className="px-3 py-2.5 text-sm rounded-md hover:bg-accent flex items-center gap-3 text-muted-foreground [&.active]:bg-accent [&.active]:text-foreground"
                    activeProps={{ className: "active" }}
                  >
                    <n.icon className="w-4 h-4" />
                    {n.label}
                    {n.to === "/chats" && unreadChats > 0 && <span className="ml-auto rounded-full bg-primary text-primary-foreground text-[10px] min-w-5 h-5 px-1 flex items-center justify-center">{unreadChats}</span>}
                  </Link>
                ))}
                <button
                  onClick={() => { setOpen(false); handleLogout(); }}
                  className="mt-2 px-3 py-2.5 text-sm rounded-md hover:bg-accent flex items-center gap-3 text-muted-foreground"
                >
                  <LogOut className="w-4 h-4" /> Выйти
                </button>
              </nav>
            </SheetContent>
          </Sheet>

          <div className="font-bold text-lg tracking-tight shrink-0">
            Finance<span className="text-primary">CRM</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-accent flex items-center gap-2 text-muted-foreground [&.active]:bg-accent [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
                {n.to === "/chats" && unreadChats > 0 && <span className="rounded-full bg-primary text-primary-foreground text-[10px] min-w-5 h-5 px-1 flex items-center justify-center">{unreadChats}</span>}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 min-w-0">
            <div className="hidden sm:block text-sm text-right leading-tight min-w-0">
              <div className="font-medium truncate">{currentUser?.name}</div>
              <div className="text-xs text-muted-foreground">
                {currentUser?.role === "admin" ? "Руководитель" : "Менеджер"}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden md:inline-flex">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full p-3 md:p-6">{children}</div>
      </main>
    </div>
  );
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { currentUser, loading } = useCrm();
  const router = useRouter();
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    if (!currentUser) void router.navigate({ to: "/auth" });
    else if (admin && currentUser.role !== "admin") void router.navigate({ to: "/kanban", search: {} });
  }, [admin, currentUser, loading, router]);
  if (typeof window === "undefined") return null;
  if (loading) return null;
  if (!currentUser) return null;
  if (admin && currentUser.role !== "admin") return null;
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
