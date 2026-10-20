-- Nomes de artigos únicos sem olhar a acentos nem maiúsculas ("Botas de segurança" = "botas de seguranca"), como no
-- protótipo: ao acrescentar um artigo a partir da ficha do trabalhador, um nome já existente reaproveita o artigo.
-- unaccent() não é IMMUTABLE (depende do dicionário), por isso o índice usa um invólucro com o dicionário fixo.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE FUNCTION app.fold_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, pg_temp
AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, btrim(p_name))) $$;

GRANT EXECUTE ON FUNCTION app.fold_name(text) TO andaime_app;

DROP INDEX equipment_items_name_size_uk;
CREATE UNIQUE INDEX equipment_items_name_size_uk ON equipment_items (organization_id, app.fold_name(name), coalesce(size, ''))
    WHERE archived_at IS NULL;
