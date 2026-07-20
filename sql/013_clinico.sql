-- =====================================================================
-- Quasar Gestão — Camada clínica (segmento saúde: dentista/fisio/nutri)
-- Rode INTEIRO no Supabase: SQL Editor > New query > Run.
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Depende de 001_multiloja.sql (tenants, current_tenant_id, set_tenant_id),
--            007_segmentos.sql (segmentos, tenants.segmento),
--            009_create_tenant_segmento.sql (create_tenant 2-arg),
--            012_agenda.sql (agendamentos).
--
-- Levantamento em produção (20/07/2026): 0 tenants usam 'fisioterapia',
-- pode ser retirado sem migração de dado. Segmento e sub_segmento são eixos
-- independentes do plano (núcleo/quasar_pro/constelação) — não mexe em
-- src/lib/planos.js nem em assinaturas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. tenants.sub_segmento — só relevante quando segmento='saude'.
-- ---------------------------------------------------------------------
alter table public.tenants
  add column if not exists sub_segmento text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_sub_segmento_check' and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_sub_segmento_check
      check (sub_segmento is null or sub_segmento in ('dentista','fisio','nutri'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. segmentos: retira 'fisioterapia' (sem tenant usando), semeia 'saude'.
--    Termos neutros entre dentista/fisio/nutri — ajuste fino por sub-tipo
--    vai em tenants.termos_customizados (mecanismo já existente).
-- ---------------------------------------------------------------------
delete from public.segmentos where id = 'fisioterapia';

insert into public.segmentos (id, nome, termos) values
('saude', 'Saúde', '{
  "profissional":  "Profissional",
  "profissionais": "Profissionais",
  "servico":       "Procedimento",
  "servicos":      "Procedimentos",
  "atendimento":   "Consulta",
  "atendimentos":  "Consultas",
  "cliente":       "Paciente",
  "clientes":      "Pacientes",
  "comanda":       "Prontuário",
  "pacote":        "Pacote de sessões"
}'::jsonb)
on conflict (id) do update
  set nome = excluded.nome,
      termos = excluded.termos;

-- ---------------------------------------------------------------------
-- 3. create_tenant com 3º parâmetro p_sub_segmento.
--    Drop explícito do overload 2-arg antes do create — já vimos esse
--    exato bug de ambiguidade em 009/011, não repetir.
-- ---------------------------------------------------------------------
drop function if exists public.create_tenant(text, text);

create or replace function public.create_tenant(
  nome_barbearia text,
  p_segmento     text default 'barbearia',
  p_sub_segmento text default null
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

  if not exists (select 1 from public.segmentos where id = p_segmento and ativo) then
    raise exception 'segmento inválido: %', p_segmento;
  end if;

  if p_segmento = 'saude' and (p_sub_segmento is null or p_sub_segmento not in ('dentista','fisio','nutri')) then
    raise exception 'sub_segmento obrigatório e inválido para segmento saude: %', p_sub_segmento;
  end if;
  if p_segmento <> 'saude' and p_sub_segmento is not null then
    raise exception 'sub_segmento só é válido para segmento saude';
  end if;

  select count(*) into v_qtd
  from public.tenant_users
  where user_id = auth.uid() and papel = 'admin';

  select public.limite_unidades_usuario() into v_limite;

  if v_qtd >= v_limite then
    raise exception 'limite de unidades do plano atingido (% de %)', v_qtd, v_limite
      using errcode = 'check_violation';
  end if;

  insert into public.tenants (nome, segmento, sub_segmento)
  values (coalesce(nullif(trim(nome_barbearia), ''), 'Minha Barbearia'), p_segmento, p_sub_segmento)
  returning id into novo;

  insert into public.tenant_users (user_id, tenant_id, papel)
  values (auth.uid(), novo, 'admin');

  insert into public.assinaturas (tenant_id, plano, status)
  values (novo, 'nucleo', 'ativo');

  return novo;
end;
$$;

grant execute on function public.create_tenant(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. anamneses — 1 linha por cliente (upsert), histórico de saúde.
-- ---------------------------------------------------------------------
create table if not exists public.anamneses (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  cliente_id     bigint not null references public.clientes(id) on delete cascade,
  dados          jsonb not null default '{}'::jsonb,
  observacoes    text,
  atualizado_em  timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (tenant_id, cliente_id)
);

-- ---------------------------------------------------------------------
-- 5. evolucoes — prontuário por atendimento. agendamento_id NULLABLE:
--    aceita atendimento avulso, sem forçar uso da agenda.
-- ---------------------------------------------------------------------
create table if not exists public.evolucoes (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  cliente_id      bigint not null references public.clientes(id) on delete cascade,
  agendamento_id  bigint references public.agendamentos(id) on delete set null,
  data            date not null default current_date,
  texto           text not null,
  criado_por      uuid not null default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. planos_tratamento + fases_tratamento — uso restrito a sub_segmento
--    'dentista' só no front; RLS aqui continua só por tenant.
-- ---------------------------------------------------------------------
create table if not exists public.planos_tratamento (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  cliente_id        bigint not null references public.clientes(id) on delete cascade,
  titulo            text not null,
  status            text not null default 'ativo' check (status in ('ativo','concluido','cancelado','pausado')),
  data_inicio       date,
  previsao_termino  date,
  valor_total       numeric(10,2),
  observacoes       text,
  created_at        timestamptz not null default now()
);

create table if not exists public.fases_tratamento (
  id                    bigint generated always as identity primary key,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  plano_tratamento_id   bigint not null references public.planos_tratamento(id) on delete cascade,
  ordem                 int not null default 1,
  nome                  text not null,
  descricao             text,
  status                text not null default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  previsao_data         date,
  concluida_em          date,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. odontogramas — 1 linha por (cliente, dente), notação FDI.
--    Modelo "estado atual" (sem histórico de evolução do dente).
-- ---------------------------------------------------------------------
create table if not exists public.odontogramas (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  cliente_id     bigint not null references public.clientes(id) on delete cascade,
  dente_numero   text not null,
  faces          jsonb not null default '{}'::jsonb,
  status_geral   text,
  observacoes    text,
  atualizado_em  timestamptz not null default now(),
  unique (tenant_id, cliente_id, dente_numero)
);

-- ---------------------------------------------------------------------
-- 8. tenant_id auto-fill + índices + RLS (padrão do 001/008/012) pras
--    6 tabelas novas.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['anamneses','evolucoes','planos_tratamento','fases_tratamento','odontogramas'] loop
    execute format('create index if not exists %I on public.%I (tenant_id);', t || '_tenant_idx', t);
    execute format('drop trigger if exists set_tenant_id_trg on public.%I;', t);
    execute format('create trigger set_tenant_id_trg before insert on public.%I for each row execute function public.set_tenant_id();', t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists tenant_isolation on public.%I;', t);
    execute format(
      'create policy tenant_isolation on public.%I
         using (tenant_id = public.current_tenant_id())
         with check (tenant_id = public.current_tenant_id());', t);
  end loop;
end $$;

-- índices extra de busca por cliente
create index if not exists evolucoes_cliente_idx on public.evolucoes (tenant_id, cliente_id, data desc);
create index if not exists planos_tratamento_cliente_idx on public.planos_tratamento (tenant_id, cliente_id);
create index if not exists fases_tratamento_plano_idx on public.fases_tratamento (plano_tratamento_id, ordem);
create index if not exists odontogramas_cliente_idx on public.odontogramas (tenant_id, cliente_id);

-- =====================================================================
-- FIM. Front: supabase.rpc('create_tenant', { nome_barbearia, p_segmento, p_sub_segmento }).
-- Próxima migração (014): documentos_clinicos + Storage.
-- =====================================================================
