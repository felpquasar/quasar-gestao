-- =====================================================================
-- Quasar Gestão — Documentos clínicos (fotos intraorais, radiografias)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 013_clinico.sql (tenants.sub_segmento, tabelas clínicas).
--
-- ATENÇÃO: buckets 'cometicos'/'product-images'/'produtos' já existem no
-- projeto mas NÃO servem de referência — a policy de INSERT do 'cometicos'
-- não checa tenant nenhum (qual=null, qualquer autenticado insere). Dado
-- clínico é sensível (LGPD art. 11): bucket novo privado, policy por tenant
-- no path, do zero.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. documentos_clinicos — metadado do arquivo (arquivo em si vai no Storage)
-- ---------------------------------------------------------------------
create table if not exists public.documentos_clinicos (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  cliente_id     bigint not null references public.clientes(id) on delete cascade,
  evolucao_id    bigint references public.evolucoes(id) on delete set null,
  tipo           text not null default 'foto' check (tipo in ('foto','raio_x','documento')),
  storage_path   text not null,
  legenda        text,
  created_at     timestamptz not null default now()
);

create index if not exists documentos_clinicos_tenant_idx on public.documentos_clinicos (tenant_id);
create index if not exists documentos_clinicos_cliente_idx on public.documentos_clinicos (tenant_id, cliente_id);

drop trigger if exists set_tenant_id_trg on public.documentos_clinicos;
create trigger set_tenant_id_trg before insert on public.documentos_clinicos
  for each row execute function public.set_tenant_id();

alter table public.documentos_clinicos enable row level security;
drop policy if exists tenant_isolation on public.documentos_clinicos;
create policy tenant_isolation on public.documentos_clinicos
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------------------------
-- 2. Bucket privado. Path convention: '<tenant_id>/<cliente_id>/<uuid>.<ext>'
--    de forma que (storage.foldername(name))[1] = tenant_id::text.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos-clinicos', 'documentos-clinicos', false, 15728640)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------
-- 3. Policies em storage.objects — isolamento por tenant no 1º segmento
--    do path. current_tenant_id() é security definer, seguro de reusar
--    aqui (não depende de RLS de outra tabela).
-- ---------------------------------------------------------------------
drop policy if exists documentos_clinicos_select on storage.objects;
create policy documentos_clinicos_select on storage.objects
  for select using (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists documentos_clinicos_insert on storage.objects;
create policy documentos_clinicos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists documentos_clinicos_update on storage.objects;
create policy documentos_clinicos_update on storage.objects
  for update using (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists documentos_clinicos_delete on storage.objects;
create policy documentos_clinicos_delete on storage.objects
  for delete using (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

-- =====================================================================
-- FIM. Front: upload em `${tenantId}/${clienteId}/${crypto.randomUUID()}.${ext}`,
-- leitura via createSignedUrl (bucket privado, getPublicUrl não funciona).
-- =====================================================================
