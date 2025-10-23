import { Link, useLocation } from "react-router-dom";
import { Home, LayoutGrid, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Até logo!");
      navigate("/auth");
    }
  };

  const navItems = [
    { path: "/", icon: Home, label: "Metricas Enlev" },
    { path: "/kanban", icon: LayoutGrid, label: "Análise Leads" },
    { path: "/perfil", icon: User, label: "Perfil" },
  ];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
      <nav className="w-full max-w-6xl rounded-full border border-border/40 bg-card/80 backdrop-blur-xl shadow-lg px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">E</span>
            </div>
            <span className="font-semibold text-lg hidden sm:inline">Enlev CRM</span>
          </div>

          {!isMobile && (
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    asChild
                    className="gap-2"
                  >
                    <Link to={item.path}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </Button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isMobile ? (
              <MobileNav />
            ) : (
              <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full">
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
