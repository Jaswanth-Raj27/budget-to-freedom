import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="app-backdrop min-h-screen">
      <AppHeader />
      <main key={pathname} className="route-enter mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}
