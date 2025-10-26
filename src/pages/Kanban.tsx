import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Phone, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Kanban() {
  const [automatizados, setAutomatizados] = useState<any[]>([]);
  const [emEspera, setEmEspera] = useState<any[]>([]);
  const [comCorretor, setComCorretor] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const isMobile = useIsMobile();
  const [isHistoricoOpen, setIsHistoricoOpen] = useState(false);
  const [historicoChat, setHistoricoChat] = useState<any[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

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

  const handleVerHistorico = async (sessionId: string) => {
    setLoadingHistorico(true);
    setIsHistoricoOpen(true);
    
    const { data, error } = await supabase
      .from("n8n_chat_histories")
      .select("message, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar histórico");
      setHistoricoChat([]);
    } else {
      setHistoricoChat(data || []);
    }
    
    setLoadingHistorico(false);
  };

  const getChannelBadge = (canal: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      whatsapp: { label: "WhatsApp", className: "bg-success" },
      instagram: { label: "Instagram", className: "bg-accent" },
    };
    const variant = variants[canal] || { label: canal, className: "" };
    return <Badge className={variant.className}>{variant.label}</Badge>;
  };

  const renderColumn = (title: string, data: any[], type: "auto" | "espera" | "corretor") => (
    <div className="space-y-4">
      <Card className={type === "auto" ? "bg-muted/30" : type === "espera" ? "bg-warning/10" : "bg-success/10"}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
      </Card>
      <div className="space-y-3">
        {data.map((atendimento) => (
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
                {type === "espera" && atendimento.timestamp_fila && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(atendimento.timestamp_fila), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                )}
                {type === "corretor" && atendimento.profiles && (
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
                {type === "auto" && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleVerHistorico(atendimento.session_id)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Histórico Chatbot
                    </Button>
                    <Button
                      onClick={() => handleAssumirAutomatizado(atendimento.id)}
                      className="flex-1"
                      variant="outline"
                      size="sm"
                    >
                      Assumir
                    </Button>
                  </div>
                )}
                {type === "espera" && (
                  <div className="space-y-2">
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
                        onClick={() => handleVerHistorico(atendimento.session_id)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Histórico
                      </Button>
                    </div>
                    <Button
                      onClick={() => handleAssumirEspera(atendimento.id)}
                      size="sm"
                      className="w-full"
                    >
                      Assumir
                    </Button>
                  </div>
                )}
                {type === "corretor" && (
                  <Button
                    onClick={() => handleFinalizar(atendimento.id)}
                    className="w-full"
                    variant="default"
                  >
                    Finalizar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="container mx-auto px-4 py-8 mt-20 flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Análise de Canais</h1>
          <p className="text-muted-foreground">Gerencie atendimentos em tempo real</p>
        </div>

        {isMobile ? (
          <Tabs defaultValue="auto" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="auto">Automático</TabsTrigger>
              <TabsTrigger value="espera">Em Espera</TabsTrigger>
              <TabsTrigger value="corretor">Assumidos</TabsTrigger>
            </TabsList>
            <TabsContent value="auto">
              {renderColumn("Em Atendimento Automático", automatizados, "auto")}
            </TabsContent>
            <TabsContent value="espera">
              {renderColumn("Clientes em Espera", emEspera, "espera")}
            </TabsContent>
            <TabsContent value="corretor">
              {renderColumn("Atendimentos Assumidos", comCorretor, "corretor")}
            </TabsContent>
          </Tabs>
        ) : (
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
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleVerHistorico(atendimento.session_id)}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Histórico
                        </Button>
                        <Button
                          onClick={() => handleAssumirAutomatizado(atendimento.id)}
                          className="flex-1"
                          variant="outline"
                          size="sm"
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
                      <div className="space-y-2">
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
                            onClick={() => handleVerHistorico(atendimento.session_id)}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Histórico
                          </Button>
                        </div>
                        <Button
                          onClick={() => handleAssumirEspera(atendimento.id)}
                          size="sm"
                          className="w-full"
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
        )}
      </div>

      <Footer />

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

      <Dialog open={isHistoricoOpen} onOpenChange={setIsHistoricoOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Histórico do Chatbot</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {loadingHistorico ? (
              <p className="text-center text-muted-foreground">Carregando histórico...</p>
            ) : historicoChat.length === 0 ? (
              <p className="text-center text-muted-foreground">Histórico vazio.</p>
            ) : (
              <div className="space-y-4">
                {historicoChat.map((msg, idx) => {
                  // NOTE: A estrutura do JSON em 'message' pode precisar de ajuste.
                  // Assumindo: { sender: 'user' | 'bot', text: 'mensagem_texto' }
                  const messageData = msg.message as any;
                  const isUser = messageData?.sender === 'user';
                  
                  return (
                    <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] space-y-1`}>
                        <div className={`rounded-lg p-3 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          <p className="text-sm whitespace-pre-wrap">{messageData?.text || JSON.stringify(messageData)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground px-1">
                          {format(new Date(msg.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
