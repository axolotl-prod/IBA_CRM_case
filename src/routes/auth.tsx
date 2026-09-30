import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useCrm } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
  head: () => ({ meta: [{ title: "Вход · FinanceCRM" }] }),
});

const PRESETS = [
  { label: "Руководитель (Вася)", login: "admin", password: "admin123" },
  { label: "Менеджер (Алина)", login: "alina", password: "manager123" },
  { label: "Менеджер (Паша)", login: "pasha", password: "manager123" },
];

function AuthPage() {
  const { login } = useCrm();
  const router = useRouter();
  const [loginStr, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin123");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await login(loginStr, password)) {
      toast.success("Добро пожаловать!");
      router.navigate({ to: "/" });
    } else {
      toast.error("Неверный логин или пароль");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6">
          <div className="text-2xl font-bold">
            Finance<span className="text-primary">CRM</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Вход в систему</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="l">Логин</Label>
            <Input id="l" value={loginStr} onChange={(e) => setLogin(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="p">Пароль</Label>
            <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full">
            Войти
          </Button>
        </form>
        <div className="mt-6 pt-6 border-t">
          <div className="text-xs text-muted-foreground mb-2">Быстрый вход (тестовые аккаунты):</div>
          <div className="flex flex-col gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.login}
                type="button"
                onClick={() => {
                  setLogin(p.login);
                  setPassword(p.password);
                }}
                className="text-left text-sm px-3 py-2 rounded-md border hover:bg-accent transition"
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">
                  {p.login} / {p.password}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
