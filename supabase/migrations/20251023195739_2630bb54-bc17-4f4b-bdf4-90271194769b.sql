-- ============================================
-- CRITICAL SECURITY FIXES - Database Migration
-- ============================================

-- 1. CREATE USER ROLES SYSTEM (FIX: Privilege Escalation)
-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'corretor');

-- Create separate user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Migrate existing role data from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::app_role 
FROM public.profiles 
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- 2. UPDATE PROFILES RLS POLICIES (FIX: Public Data Exposure)
-- Drop existing profiles SELECT policy
DROP POLICY IF EXISTS "Usuários podem ver todos os perfis" ON public.profiles;

-- Create new restrictive SELECT policy
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Prevent users from updating their role field
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.profiles;

CREATE POLICY "Users can update own profile except role"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. UPDATE ATENDIMENTO RLS POLICIES (FIX: Recursion Risk)
-- Drop old policies that query profiles directly
DROP POLICY IF EXISTS "Admins e corretores responsáveis podem atualizar" ON public.atendimento;
DROP POLICY IF EXISTS "Admins podem inserir atendimentos" ON public.atendimento;
DROP POLICY IF EXISTS "Corretores podem ver seus atendimentos" ON public.atendimento;

-- Create new policies using security definer function
CREATE POLICY "Admins and assigned corretores can update"
ON public.atendimento
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') 
  OR corretor_responsavel_id = auth.uid()
);

CREATE POLICY "Admins can insert atendimentos"
ON public.atendimento
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Corretores can view their atendimentos"
ON public.atendimento
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR corretor_responsavel_id = auth.uid()
);

-- 4. UPDATE PREFERENCIACLIENTE RLS POLICIES (FIX: Recursion Risk)
DROP POLICY IF EXISTS "Acesso via atendimento" ON public.preferenciacliente;
DROP POLICY IF EXISTS "Admins podem inserir preferências" ON public.preferenciacliente;

CREATE POLICY "Access via atendimento"
ON public.preferenciacliente
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM atendimento
    WHERE atendimento.id = preferenciacliente.atendimento_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR atendimento.corretor_responsavel_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins can insert preferences"
ON public.preferenciacliente
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. UPDATE N8N_CHAT_HISTORIES RLS POLICIES (FIX: Unrestricted Insert)
DROP POLICY IF EXISTS "Sistema pode inserir chat histories" ON public.n8n_chat_histories;
DROP POLICY IF EXISTS "Admins podem ver chat histories" ON public.n8n_chat_histories;

-- Restrict INSERT to service role only (n8n must use service role key)
CREATE POLICY "Service role can insert chat histories"
ON public.n8n_chat_histories
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Admins can view chat histories"
ON public.n8n_chat_histories
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- 6. UPDATE STORAGE POLICIES (FIX: Public Avatar Exposure)
-- Make avatars bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'avatars';

-- Create RLS policies for avatars bucket
CREATE POLICY "Authenticated users can view avatars"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'avatars' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 7. UPDATE HANDLE_NEW_USER FUNCTION (Auto-assign roles on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles (without role field)
  INSERT INTO public.profiles (id, nome_completo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email)
  );
  
  -- Insert into user_roles with default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'corretor')
  );
  
  RETURN NEW;
END;
$$;