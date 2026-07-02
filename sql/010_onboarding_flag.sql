-- ---------------------------------------------------------------------
-- 010_onboarding_flag.sql
-- Flag de onboarding por tenant (server-side), substitui o controle via
-- localStorage — que era por-dispositivo e fazia o wizard reaparecer no
-- celular depois de dispensado no desktop.
-- Depende de 001_multiloja.sql (tenants, current_tenant_id).
-- ---------------------------------------------------------------------

alter table public.tenants
  add column if not exists onboarding_done boolean not null default false;

-- Marca o onboarding como concluído para o tenant do usuário logado.
-- SECURITY DEFINER: escreve mesmo com a policy de update restrita.
create or replace function public.marcar_onboarding_done()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tenants
     set onboarding_done = true
   where id = public.current_tenant_id();
$$;

grant execute on function public.marcar_onboarding_done() to authenticated;
