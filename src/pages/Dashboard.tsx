import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Instagram, Bell, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function Dashboard() {
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [instagramCount, setInstagramCount] = useState(0);
  const [topPreferences, setTopPreferences] = useState<any[]>([]);
  const [queueProfiles, setQueueProfiles] = useState<any[]>([]);

  useEffect(() => {
    loadMetrics();
    loadTopPreferences();
    loadQueueOrder();

    // Real-time subscription for new leads
    const channel = supabase
      .channel("dashboard-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "atendimento",
          filter: "status=eq.Em Espera",
        },
        (payload) => {
          toast("Novo lead aguardando!", {
            description: `Cliente: ${payload.new.cliente_nome}`,
            icon: <Bell className="h-4 w-4" />,
          });
          loadMetrics();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "atendimento",
        },
        () => {
          loadMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMetrics = async () => {
    const { data: whatsappData } = await supabase
      .from("atendimento")
      .select("*", { count: "exact", head: true })
      .eq("canal", "whatsapp")
      .eq("status", "Automatizado");

    const { data: instagramData } = await supabase
      .from("atendimento")
      .select("*", { count: "exact", head: true })
      .eq("canal", "instagram")
      .eq("status", "Automatizado");

    setWhatsappCount(whatsappData?.length || 0);
    setInstagramCount(instagramData?.length || 0);
  };

  const loadTopPreferences = async () => {
    const { data } = await supabase
      .from("preferenciacliente")
      .select("tipo, valor_texto, valor_numero")
      .limit(20);

    if (data) {
      const aggregated = data.reduce((acc: any, curr) => {
        const key = curr.valor_texto || curr.valor_numero?.toString() || "";
        if (!acc[key]) {
          acc[key] = { value: key, count: 0, tipo: curr.tipo };
        }
        acc[key].count++;
        return acc;
      }, {});

      const sorted = Object.values(aggregated)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 8);

      setTopPreferences(sorted);
    }
  };

  const loadQueueOrder = async () => {
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "corretor");

    if (!rolesData) return;

    const corretorIds = rolesData.map(r => r.user_id);

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("id", corretorIds)
      .order("posicao_fila", { ascending: true })
      .limit(5);

    if (data) {
      setQueueProfiles(data);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="container mx-auto px-4 py-8 mt-20 flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Métricas Enlev</h1>
          <p className="text-muted-foreground">Visão geral do sistema em tempo real</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-card border-none shadow-md hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
              <MessageSquare className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{whatsappCount}</div>
              <p className="text-xs text-muted-foreground">atendimentos ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-none shadow-md hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Instagram</CardTitle>
              <Instagram className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{instagramCount}</div>
              <p className="text-xs text-muted-foreground">atendimentos ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card border-none shadow-md hover:shadow-lg transition-all lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Preferências Mais Buscadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topPreferences.map((pref: any, index) => (
                  <Badge key={index} variant="secondary" className="px-3 py-1">
                    {pref.value} ({pref.count})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Ordem da Fila</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {queueProfiles.map((profile, index) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="relative">
                    <Avatar>
                      <AvatarImage src={profile.foto_url} />
                      <AvatarFallback>{profile.nome_completo[0]}</AvatarFallback>
                    </Avatar>
                    {index === 0 && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{profile.nome_completo}</p>
                    <p className="text-sm text-muted-foreground">
                      Posição {profile.posicao_fila}
                    </p>
                  </div>
                  {index === 0 && (
                    <Badge variant="default" className="bg-success">
                      Próximo
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
