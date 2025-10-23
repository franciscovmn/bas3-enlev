import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Kanban() {
  const [automatizados, setAutomatizados] = useState<any[]>([]);
  const [emEspera, setEmEspera] = useState<any[]>([]);
  const [comCorretor, setComCorretor] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    loadCurrentUser();
    loadAtendimentos();

    const channel = supabase
      .channel("kanban-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "atendimento",
        },
        () => {
          loadAtendimentos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setUserProfile(profile);
    }
  };

  const loadAtendimentos = async () => {
    const { data: auto } = await supabase
      .from("atendimento")
      .select("*")
      .eq("status", "Automatizado")
      .order("created_at", { ascending: false });

    const { data: espera } = await supabase
      .from("atendimento")
      .select("*")
      .eq("status", "Em Espera")
      .order("timestamp_fila", { ascending: true });

    const { data: corretor } = await supabase
      .from("atendimento")
      .select("*, profiles(*)")
      .eq("status", "Com Corretor")
      .order("updated_at", { ascending: false });

    setAutomatizados(auto || []);
    setEmEspera(espera || []);
    setComCorretor(corretor || []);
  };

  const handleAssumirAutomatizado = async (atendimentoId: number) => {
    if (!currentUser) return;

    const { error } = await supabase
      .from("atendimento")
      .update({
        status: "Com Corretor",
        corretor_responsavel_id: currentUser.id,
      })
      .eq("id", atendimentoId);

    if (error) {
      toast.error("Erro ao assumir atendimento");
    } else {
      toast.success("Atendimento assumido!");
    }
  };

  const handleAssumirEspera = async (atendimentoId: number) => {
    if (!currentUser || !userProfile) return;

    if (userProfile.posicao_fila !== 1) {
      toast.error("Não é sua vez na fila!");
      return;
    }

    const { error: updateError } = await supabase
      .from("atendimento")
      .update({
        status: "Com Corretor",
        corretor_responsavel_id: currentUser.id,
      })
      .eq("id", atendimentoId);

    if (updateError) {
      toast.error("Erro ao assumir atendimento");
      return;
    }

    const { error: rpcError } = await (supabase.rpc as any)("rotacionar_fila", {
      corretor_id: currentUser.id,
    });

    if (rpcError) {
      console.error("Erro ao rotacionar fila:", rpcError);
    }

    toast.success("Atendimento assumido! Você foi movido para o final da fila.");
  };

  const handleFinalizar = async (atendimentoId: number) => {
    const { error } = await supabase
      .from("atendimento")
      .update({ status: "Finalizado" })
      .eq("id", atendimentoId);

    if (error) {
      toast.error("Erro ao finalizar atendimento");
    } else {
      toast.success("Atendimento finalizado!");
    }
  };

  const getChannelBadge = (canal: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      whatsapp: { label: "WhatsApp", className: "bg-success" },
      instagram: { label: "Instagram", className: "bg-accent" },
    };
    const variant = variants[canal] || { label: canal, className: "" };
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Análise de Canais</h1>
          <p className="text-muted-foreground">Gerencie atendimentos em tempo real</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Automatizado */}
          <div className="space-y-4">
            <Card className="bg-muted/30">
              <CardHeader>
                <CardTitle className="text-lg">Em Atendimento Automático</CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {automatizados.map((atendimento) => (
                <Card key={atendimento.id} className="shadow-sm hover:shadow-md transition-all">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{atendimento.cliente_nome}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {atendimento.cliente_contato}
                          </p>
                        </div>
                        {getChannelBadge(atendimento.canal)}
                      </div>
                      <Button
                        onClick={() => handleAssumirAutomatizado(atendimento.id)}
                        className="w-full"
                        variant="outline"
                      >
                        Assumir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Coluna 2: Em Espera */}
          <div className="space-y-4">
            <Card className="bg-warning/10">
              <CardHeader>
                <CardTitle className="text-lg">Clientes em Espera</CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {emEspera.map((atendimento) => (
                <Card key={atendimento.id} className="shadow-sm hover:shadow-md transition-all">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{atendimento.cliente_nome}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {atendimento.cliente_contato}
                          </p>
                        </div>
                        {getChannelBadge(atendimento.canal)}
                      </div>
                      {atendimento.timestamp_fila && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(atendimento.timestamp_fila), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => setSelectedReport(atendimento.relatorio_ia)}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          Ver Relatório
                        </Button>
                        <Button
                          onClick={() => handleAssumirEspera(atendimento.id)}
                          size="sm"
                          className="flex-1"
                        >
                          Assumir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Coluna 3: Com Corretor */}
          <div className="space-y-4">
            <Card className="bg-success/10">
              <CardHeader>
                <CardTitle className="text-lg">Atendimentos Assumidos</CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {comCorretor.map((atendimento) => (
                <Card key={atendimento.id} className="shadow-sm hover:shadow-md transition-all">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{atendimento.cliente_nome}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {atendimento.cliente_contato}
                          </p>
                        </div>
                        {getChannelBadge(atendimento.canal)}
                      </div>
                      {atendimento.profiles && (
                        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={atendimento.profiles.foto_url} />
                            <AvatarFallback>
                              {atendimento.profiles.nome_completo[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{atendimento.profiles.nome_completo}</span>
                        </div>
                      )}
                      <Button
                        onClick={() => handleFinalizar(atendimento.id)}
                        className="w-full"
                        variant="default"
                      >
                        Finalizar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório IA</DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap">{selectedReport}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
