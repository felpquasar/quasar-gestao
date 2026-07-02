-- =====================================================================
-- Quasar Gestão — v2.0 — create_tenant com segmento
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 006_limite_unidades.sql (versão anterior de create_tenant)
--            e 007_segmentos.sql (tabela segmentos + coluna tenants.segmento).
--
-- Implementa arquitetura-quasar-gestao-v2.md §7.1.
-- Mantém a lógica de LIMITE de unidades do 006 e o insert de assinatura.
-- Acrescenta: valida e grava o segmento da nova loja.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Remove a versão 1-arg do 006 para não criar overload ambíguo.
-- A nova versão tem p_segmento com DEFAULT 'barbearia' — chamadas antigas
-- do front (só nome_barbearia) continuam válidas via default.
-- ---------------------------------------------------------------------
drop function if exists public.create_tenant(text);

create or replace function public.create_tenant(
  nome_barbearia text,
  p_segmento     text default 'barbearia'
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  novo     uuid;
  v_qtd    int;
  v_limite int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  -- segmento precisa existir e estar ativo
  if not exists (select 1 from public.segmentos where id = p_segmento and ativo) then
    raise exception 'segmento inválido: %', p_segmento;
  end if;

  -- limite de unidades do plano (checagem imperativa — RLS não expressa quantidade)
  select count(*) into v_qtd
  from public.tenant_users
  where user_id = auth.uid() and papel = 'admin';

  select public.limite_unidades_usuario() into v_limite;

  if v_qtd >= v_limite then
    raise exception 'limite de unidades do plano atingido (% de %)', v_qtd, v_limite
      using errcode = 'check_violation';
  end if;

  insert into public.tenants (nome, segmento)
  values (coalesce(nullif(trim(nome_barbearia), ''), 'Minha Barbearia'), p_segmento)
  returning id into novo;

  insert into public.tenant_users (user_id, tenant_id, papel)
  values (auth.uid(), novo, 'admin');

  insert into public.assinaturas (tenant_id, plano, status)
  values (novo, 'nucleo', 'ativo');

  return novo;
end;
$$;

grant execute on function public.create_tenant(text, text) to authenticated;

-- =====================================================================
-- FIM. Front chama: supabase.rpc('create_tenant', { nome_barbearia, p_segmento })
--  - p_segmento omitido => 'barbearia' (compatível com onboarding atual).
--  - Onboarding deve tornar o segmento a 1ª pergunta (trabalho de front, §7.1).
-- =====================================================================
