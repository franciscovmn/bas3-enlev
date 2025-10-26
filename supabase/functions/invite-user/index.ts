import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface InviteUserRequest {
  email: string;
  role: "admin" | "corretor";
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticação do requisitante
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Não autorizado");
    }

    // Criar cliente Supabase com o token do usuário
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verificar se o usuário logado é admin
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const { data: userRoles } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!userRoles) {
      throw new Error("Apenas administradores podem enviar convites");
    }

    // Parsear dados da requisição
    const { email, role }: InviteUserRequest = await req.json();

    if (!email || !role) {
      throw new Error("Email e role são obrigatórios");
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Email inválido");
    }

    // Validar role
    if (role !== "admin" && role !== "corretor") {
      throw new Error("Role inválida. Use 'admin' ou 'corretor'");
    }

    console.log(`Admin ${user.email} convidando ${email} como ${role}`);

    // Criar cliente admin do Supabase
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Convidar usuário
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role: role },
        redirectTo: `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovableproject.com') || 'https://0828ca58-d1ce-4498-b034-547eccaa9fbe.lovableproject.com'}/auth`,
      });

    if (inviteError) {
      console.error("Erro ao convidar usuário:", inviteError);
      throw new Error(`Erro ao convidar usuário: ${inviteError.message}`);
    }

    console.log("Convite criado com sucesso:", inviteData);

    // Enviar email de convite usando Resend
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Você foi convidado para o ENLEVE CRM</h1>
        <p style="color: #666; font-size: 16px;">
          Olá! Você foi convidado para se juntar ao ENLEVE CRM como <strong>${role === 'admin' ? 'Administrador' : 'Corretor'}</strong>.
        </p>
        <p style="color: #666; font-size: 16px;">
          Para aceitar o convite e criar sua conta, clique no link que você receberá no email de confirmação do Supabase.
        </p>
        <p style="color: #666; font-size: 14px; margin-top: 40px;">
          Se você não esperava este convite, pode ignorar este email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          ENLEVE CRM - Sistema de Gerenciamento de Relacionamento com Cliente
        </p>
      </div>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "ENLEVE CRM <onboarding@resend.dev>",
      to: [email],
      subject: "Convite para ENLEVE CRM",
      html: emailHtml,
    });

    if (emailError) {
      console.error("Erro ao enviar email:", emailError);
      // Não falhar se o email não for enviado, pois o convite já foi criado
    } else {
      console.log("Email de convite enviado com sucesso para", email);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Convite enviado com sucesso",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Erro na função invite-user:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Erro ao processar convite",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
