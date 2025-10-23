import { useTheme } from "next-themes";
import logoDark from "@/assets/base_3_branca.png";
import logoLight from "@/assets/icon_completa_sem_fundo_laranja_2.png";

export function Footer() {
  const { theme } = useTheme();
  
  return (
    <footer className="border-t border-border bg-card/30 backdrop-blur-sm mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <span className="text-sm text-muted-foreground">Desenvolvido por</span>
          <img 
            src={theme === "dark" ? logoDark : logoLight} 
            alt="bas3 Logo" 
            className="h-6 object-contain"
          />
        </div>
      </div>
    </footer>
  );
}
