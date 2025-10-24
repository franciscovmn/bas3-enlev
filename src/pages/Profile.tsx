import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Loader2, Upload } from "lucide-react";
import { z } from "zod";

const profileSchema = z.object({
  nome_completo: z.string()
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(100, "Nome muito longo"),
});

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function Profile() {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [nome, setNome] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data);
        setNome(data.nome_completo);

        // Load avatar with signed URL
        if (data.foto_url) {
          const filePath = data.foto_url;
          if (filePath) {
            console.log("Attempting to get signed URL for path:", filePath); // Log para verificar o path
            try {
              const { data: signedData, error: signError } = await supabase.storage
                .from("avatars")
                .createSignedUrl(filePath, 3600); // 1 hour expiry

              if (signError) {
                console.error("Error getting signed URL:", signError);
                toast.error("Erro ao carregar a prévia da foto.");
                setAvatarUrl(null); // Limpa a URL se der erro
              } else if (signedData) {
                setAvatarUrl(signedData.signedUrl);
              }
            } catch (signCatchError) {
              console.error("Exception getting signed URL:", signCatchError);
              toast.error("Erro inesperado ao carregar foto.");
              setAvatarUrl(null);
            }
          } else {
             setAvatarUrl(null); // Clear avatar if foto_url is present but empty path
          }
        } else {
           setAvatarUrl(null); // Clear avatar if foto_url is null
        }
      }

      // Load user role from user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (roleData) {
        setUserRole(roleData.role);
      }
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return; // Add check for profile existence
    setLoading(true);

    try {
      const validation = profileSchema.safeParse({ nome_completo: nome });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ nome_completo: validation.data.nome_completo })
        .eq("id", profile.id);

      if (error) {
        console.error("Error updating profile:", error); // Log update error
        toast.error("Erro ao atualizar perfil");
      } else {
        toast.success("Perfil atualizado!");
        await loadProfile(); // Reload profile after update
      }
    } catch (error) {
       console.error("Exception updating profile:", error); // Log exception
      toast.error("Erro inesperado ao atualizar perfil");
    }

    setLoading(false);
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error("Formato inválido. Use JPEG, PNG, WebP ou GIF");
      return;
    }

    // Validate file size
    if (file.size > FILE_SIZE_LIMIT) {
      toast.error("Arquivo muito grande. Máximo: 5MB");
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const sanitizedExt = fileExt?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      // Garantir que profile e profile.id existam
      if (!profile || !profile.id) {
         toast.error("Erro: Perfil do usuário não carregado. Tente recarregar a página.");
         setUploading(false);
         return;
      }
      const fileName = `${profile.id}/${Date.now()}.${sanitizedExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
       console.error("Supabase upload error:", uploadError); // Log do erro de upload
        toast.error("Erro ao fazer upload da foto");
        setUploading(false);
        return;
      }

     console.log("Upload successful, file path:", fileName); // Confirmação de upload

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ foto_url: fileName })
        .eq("id", profile.id);

      if (updateError) {
       console.error("Error updating profile with foto_url:", updateError); // Log do erro de update
        toast.error("Erro ao atualizar foto no perfil");
      } else {
        toast.success("Foto atualizada!");
        // We need to wait for Supabase to process the update before reloading
        // A small delay might help, or ideally, Supabase functions/triggers
        // would handle invalidation, but for now, let's add a small delay.
        setTimeout(() => {
          loadProfile(); // Chamada para recarregar o perfil e a nova URL assinada
        }, 1000); // Delay 1 second before reloading profile
      }
    } catch (error) {
     console.error("Exception during avatar upload:", error); // Log de exceção geral
      toast.error("Erro inesperado ao atualizar foto");
    }

    setUploading(false);
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="container mx-auto px-4 py-8 mt-20 flex-1">
        <div className="max-w-2xl mx-auto">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Meu Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-32 w-32">
                  {/* Add key prop to force re-render when avatarUrl changes */}
                  <AvatarImage key={avatarUrl} src={avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl">
                    {nome ? nome[0] : '?'} {/* Use nome state for fallback */}
                  </AvatarFallback>
                </Avatar>
                <Label htmlFor="avatar-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    <span>Alterar Foto</span>
                  </div>
                  <Input
                    id="avatar-upload"
                    type="file"
                    accept={ALLOWED_FILE_TYPES.join(',')} // More specific accept attribute
                    className="hidden"
                    onChange={handleUploadAvatar}
                    disabled={uploading}
                  />
                </Label>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Função</Label>
                  <Input value={userRole || "Carregando..."} disabled />
                </div>

                <div className="space-y-2">
                  <Label>Posição na Fila</Label>
                  <Input value={profile.posicao_fila || "N/A"} disabled />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || uploading} // Disable while uploading too
                >
                  {loading ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}