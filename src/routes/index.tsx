import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCrm } from "@/lib/crm-store";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const { currentUser } = useCrm();
  const router = useRouter();
  useEffect(() => {
    if (!currentUser) router.navigate({ to: "/auth" });
    else if (currentUser.role === "admin") router.navigate({ to: "/dashboard" });
    else router.navigate({ to: "/desktop" });
  }, [currentUser, router]);
  return null;
}
