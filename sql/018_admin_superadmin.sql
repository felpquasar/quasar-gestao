-- =====================================================================
-- Quasar Gestão — Painel Super Admin (Felipe)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run, ou
--   node scripts/run-sql.js sql/018_admin_superadmin.sql
-- Idempotente: pode rodar mais de uma vez.
-- Depende de 001_multiloja.sql (tenants, tenant_users) e 005_planos.sql (assinaturas).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Allowlist de super admins. Ninguém lê/escreve direto (RLS fechada);
--    só via is_super_admin(), que roda SECURITY DEFINER.
-- ---------------------------------------------------------------------
create table if not exists public.super_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;
-- Sem policies = ninguém via authenticated/anon consegue select/insert/update direto.

create or replace function public.is_super_admin(p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = p_user);
$$;

grant execute on function public.is_super_admin(uuid) to authenticated;

-- Seed: conta de login do app (quasarbarber01@gmail.com) vira super admin.
insert into public.super_admins (user_id)
select id from auth.users where email = 'quasarbarber01@gmail.com'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Listagem de todos os tenants pro painel admin.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_tenants()
returns table (
  tenant_id       uuid,
  nome            text,
  segmento        text,
  sub_segmento    text,
  plano           text,
  status          text,
  trial_expira_em timestamptz,
  criado_em       timestamptz,
  qtd_usuarios    bigint,
  emails          text
)
language sql stable security definer set search_path = public as $$
  select
    t.id, t.nome, t.segmento, t.sub_segmento,
    coalesce(a.plano::text, 'nucleo'), coalesce(a.status::text, 'ativo'),
    a.trial_expira_em, t.created_at,
    count(tu.user_id),
    string_agg(u.email, ', ' order by u.email)
  from public.tenants t
  left join public.assinaturas a on a.tenant_id = t.id
  left join public.tenant_users tu on tu.tenant_id = t.id
  left join auth.users u on u.id = tu.user_id
  where public.is_super_admin()
  group by t.id, t.nome, t.segmento, t.sub_segmento, a.plano, a.status, a.trial_expira_em, t.created_at
  order by t.created_at desc;
$$;

grant execute on function public.admin_list_tenants() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Atualiza plano/status de uma assinatura (substitui o UPDATE manual
--    que o Felipe rodava no SQL Editor).
-- ---------------------------------------------------------------------
create or replace function public.admin_update_assinatura(
  p_tenant_id       uuid,
  p_plano           public.plano_tipo,
  p_status          public.plano_status,
  p_trial_expira_em timestamptz default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'acesso negado';
  end if;

  update public.assinaturas
  set plano = p_plano,
      status = p_status,
      trial_expira_em = p_trial_expira_em,
      atualizada_em = now()
  where tenant_id = p_tenant_id;
end;
$$;

grant execute on function public.admin_update_assinatura(uuid, public.plano_tipo, public.plano_status, timestamptz) to authenticated;

-- =====================================================================
-- FIM. Pra tornar outra conta super admin depois:
--   insert into public.super_admins (user_id)
--   select id from auth.users where email = 'outro@email.com';
-- =====================================================================
