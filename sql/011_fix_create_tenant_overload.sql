-- ---------------------------------------------------------------------
-- 011_fix_create_tenant_overload.sql
-- Corrige erro de ambiguidade ao criar tenant:
--   "Could not choose the best candidate function between:
--    public.create_tenant(nome_barbearia => text),
--    public.create_tenant(nome_barbearia => text, p_segmento => text)"
--
-- Causa: a versão 1-arg (006) coexiste com a 2-arg (009). O front chama só
-- com nome_barbearia, que casa nas duas (a 2-arg via DEFAULT) -> Postgres
-- não consegue escolher.
--
-- O 009 já removia a 1-arg, mas neste banco ela sobreviveu (009 não rodado
-- ou 006 reexecutado depois). Este script força a remoção, de forma
-- idempotente. A 2-arg de 009 (p_segmento default 'barbearia') permanece e
-- atende as chamadas antigas do front.
-- Depende de 009_create_tenant_segmento.sql.
-- ---------------------------------------------------------------------

drop function if exists public.create_tenant(text);
