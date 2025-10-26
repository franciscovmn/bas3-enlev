import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Instagram, Bell, TrendingUp, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";


export default function Dashboard() {
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [instagramCount, setInstagramCount] = useState(0);
  const [topPreferences, setTopPreferences] = useState<any[]>([]);
  const [corretoresAtivos, setCorretoresAtivos] = useState<any[]>([]);

  useEffect(() => {
    loadMetrics();
    loadTopPreferences();
    loadCorretoresAtivos();

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
          loadCorretoresAtivos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMetrics = async () => {
    // Código para buscar métricas continua igual...
    const { data: whatsappData, count: whatsappCountData } = await supabase
      .from("atendimento")
      .select("*", { count: "exact", head: true })
      .eq("canal", "whatsapp")
      .eq("status", "Automatizado");

    const { data: instagramData, count: instagramCountData } = await supabase
      .from("atendimento")
      .select("*", { count: "exact", head: true })
      .eq("canal", "instagram")
      .eq("status", "Automatizado");

    setWhatsappCount(whatsappCountData || 0);
    setInstagramCount(instagramCountData || 0);
  };

  const loadTopPreferences = async () => {
    // Código para buscar preferências continua igual...
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

  const loadCorretoresAtivos = async () => {
    const { data: atendimentos } = await supabase
      .from("atendimento")
      .select("corretor_responsavel_id")
      .eq("status", "Com Corretor");

    if (!atendimentos) return;

    const contagem = atendimentos.reduce((acc: any, curr) => {
      if (curr.corretor_responsavel_id) {
        acc[curr.corretor_responsavel_id] = (acc[curr.corretor_responsavel_id] || 0) + 1;
      }
      return acc;
    }, {});

    const corretorIds = Object.keys(contagem);

    if (corretorIds.length === 0) {
      setCorretoresAtivos([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome_completo, foto_url")
      .in("id", corretorIds);

    const corretoresComContagem = await Promise.all(
      (profiles || []).map(async (profile) => {
        let signedFotoUrl: string | null = null;
        if (profile.foto_url) {
          const { data: signedData } = await supabase.storage
            .from("avatars")
            .createSignedUrl(profile.foto_url, 3600);
          if (signedData) {
            signedFotoUrl = signedData.signedUrl;
          }
        }
        return {
          ...profile,
          quantidade: contagem[profile.id] || 0,
          signedFotoUrl,
        };
      })
    );

    setCorretoresAtivos(corretoresComContagem);
  };


  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="container mx-auto px-4 py-8 mt-20 flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Métricas ENLEVE</h1>
          <p className="text-muted-foreground">Visão geral do sistema em tempo real</p>
        </div>

        {/* Seção de Métricas (WhatsApp, Instagram, Preferências) continua igual */}
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
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Atendimentos por Corretor
            </CardTitle>
            <CardDescription>Corretores com atendimentos ativos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {corretoresAtivos.map((corretor) => (
                <div key={corretor.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <Avatar>
                    <AvatarImage src={corretor.signedFotoUrl || undefined} alt={corretor.nome_completo} />
                    <AvatarFallback>{corretor.nome_completo[0]}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 font-medium">{corretor.nome_completo}</span>
                  <Badge variant="secondary" className="font-semibold">
                    {corretor.quantidade}
                  </Badge>
                </div>
              ))}
              {corretoresAtivos.length === 0 && (
                <p className="text-muted-foreground text-center py-4">Nenhum atendimento ativo no momento</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}