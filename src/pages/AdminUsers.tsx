import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { UserPlus } from "lucide-react";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  role: z.enum(["admin", "corretor"], { required_error: "Selecione uma role" }),
});

export default function AdminUsers() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "corretor">("corretor");

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roles) {
      toast.error("Acesso negado. Apenas administradores podem acessar esta página.");
      navigate("/");
      return;
    }

    setIsAdmin(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = inviteSchema.safeParse({ email, role });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: validation.data.email, role: validation.data.role },
      });

      if (error) {
        toast.error("Erro ao enviar convite: " + error.message);
      } else {
        toast.success("Convite enviado com sucesso!");
        setEmail("");
        setRole("corretor");
      }
    } catch (error: any) {
      toast.error("Erro ao enviar convite: " + error.message);
    }

    setLoading(false);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 container mx-auto px-4 py-8 mt-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Gerenciar Usuários</h1>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Convidar Novo Usuário
              </CardTitle>
              <CardDescription>
                Envie um convite por email para um novo usuário se cadastrar no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select value={role} onValueChange={(value: "admin" | "corretor") => setRole(value)}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Selecione a função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corretor">Corretor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Enviando..." : "Enviar Convite"}
                </Button>
              </form>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Nota:</strong> Para que esta funcionalidade funcione completamente, é necessário:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside mt-2 space-y-1">
                  <li>Criar a Edge Function "invite-user" no Supabase</li>
                  <li>Desabilitar cadastro público nas configurações de autenticação</li>
                  <li>Configurar RESEND_API_KEY nas secrets da Edge Function</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
