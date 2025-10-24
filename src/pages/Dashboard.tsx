import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Instagram, Bell, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

// Definindo um tipo para o perfil que inclui a URL assinada da foto
type ProfileWithSignedUrl = {
  created_at: string | null;
  foto_url: string | null; // Nome do arquivo no Supabase Storage
  id: string;
  nome_completo: string;
  posicao_fila: number | null;
  // role: string; // Removido pois agora está em user_roles
  updated_at: string | null;
  signedFotoUrl?: string | null; // URL assinada para exibir a imagem
};

export default function Dashboard() {
  const [whatsappCount, setWhatsappCount] = useState(0);
  const [instagramCount, setInstagramCount] = useState(0);
  const [topPreferences, setTopPreferences] = useState<any[]>([]);
  // Usando o novo tipo para o estado
  const [queueProfiles, setQueueProfiles] = useState<ProfileWithSignedUrl[]>([]);

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
          loadQueueOrder(); // Recarrega a fila também
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
          // Considerar recarregar a fila aqui também se outras mudanças em 'atendimento' afetam a fila
          // loadQueueOrder();
        }
      )
       .on( // Adiciona um listener para mudanças nos perfis (ex: mudança de posição na fila ou foto)
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          loadQueueOrder();
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

    // *** FUNÇÃO MODIFICADA ***
    const loadQueueOrder = async () => {
    console.log("Iniciando loadQueueOrder..."); // Log 1

    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "corretor");

    if (rolesError) {
      console.error("Erro ao buscar roles:", rolesError.message); // Log de erro
      toast.error("Erro ao buscar corretores.");
      return;
    }

    if (!rolesData || rolesData.length === 0) {
      console.warn("Nenhum usuário com role 'corretor' encontrado."); // Log 2
      setQueueProfiles([]); // Limpa a fila se não houver corretores
      return;
    }

    const corretorIds = rolesData.map(r => r.user_id);
    console.log("IDs dos Corretores encontrados:", corretorIds); // Log 3

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", corretorIds)
      .order("posicao_fila", { ascending: true, nullsFirst: true }) // Explicitamente colocar nulos primeiro
      .limit(5);

    if (profilesError) {
      console.error("Erro ao buscar perfis da fila:", profilesError.message); // Log de erro
      toast.error("Erro ao carregar a fila.");
      return;
    }

    console.log("Perfis retornados pela query:", profilesData); // Log 4 (O MAIS IMPORTANTE)

    if (profilesData && profilesData.length > 0) { // Verifica se profilesData não é nulo e tem itens
      const profilesWithSignedUrls = await Promise.all(
        profilesData.map(async (profile) => {
          // ... (lógica para gerar signed url - MANTENHA IGUAL)
          let signedUrl: string | null = null;
          if (profile.foto_url) {
            const { data: signedData, error: signError } = await supabase.storage
              .from("avatars")
              .createSignedUrl(profile.foto_url, 3600);
            if (signError) {
              console.error(`Erro ao gerar URL assinada para ${profile.foto_url}:`, signError.message);
            } else {
              signedUrl = signedData.signedUrl;
            }
          }
          return {
            ...profile,
            signedFotoUrl: signedUrl,
          };
        })
      );

      console.log("Perfis processados (com URLs):", profilesWithSignedUrls); // Log 5 (O que vimos antes)
      setQueueProfiles(profilesWithSignedUrls);
    } else {
      console.log("Nenhum perfil retornado pela query ou array vazio."); // Log 6
      setQueueProfiles([]); // Limpa a fila se não houver dados
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

        {/* *** CARD DA ORDEM DA FILA MODIFICADO *** */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Ordem da Fila</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Verifica se a fila está vazia */}
              {queueProfiles.length === 0 ? (
                 <p className="text-muted-foreground text-center py-4">A fila está vazia.</p>
              ) : (
                // Mapeia os perfis para renderizar cada item da fila
                queueProfiles.map((profile, index) => (
                  <div
                    key={profile.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="relative">
                      {/* Componente Avatar para exibir a foto ou a inicial */}
                      <Avatar>
                        {/* Tenta carregar a imagem usando a URL assinada */}
                        <AvatarImage src={profile.signedFotoUrl || undefined} alt={profile.nome_completo} />
                        {/* Fallback: Mostra a primeira letra do nome se não houver foto ou URL */}
                        <AvatarFallback>
                           {profile.nome_completo ? profile.nome_completo[0].toUpperCase() : '?'}
                        </AvatarFallback>
                      </Avatar>
                      {/* Indicador verde para o próximo da fila */}
                      {index === 0 && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success ring-2 ring-background animate-pulse" />
                      )}
                    </div>
                    {/* Informações do usuário (Nome e Posição) */}
                    <div className="flex-1">
                      <p className="font-medium">{profile.nome_completo}</p>
                      <p className="text-sm text-muted-foreground">
                        Posição {profile.posicao_fila ?? 'N/A'} {/* Mostra N/A se posição for null */}
                      </p>
                    </div>
                    {/* Badge "Próximo" para o primeiro da fila */}
                    {index === 0 && (
                      <Badge variant="default" className="bg-success text-success-foreground">
                        Próximo
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}