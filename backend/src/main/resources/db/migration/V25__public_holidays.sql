-- Feriados nacionais por país. A tabela public_holidays (V10) é global, sem tenant: o calendário em Java
-- (pt.andaime.policy.domain.NationalHolidays) carrega cada (país, ano) quando é preciso pela primeira vez.
-- A aplicação deixa de poder escrever diretamente na tabela: só lê e pede o carregamento através de uma função
-- mínima, que apenas acrescenta linhas nacionais (região '') desse país e desse ano e nunca altera nem apaga.

REVOKE INSERT, UPDATE, DELETE ON public_holidays FROM andaime_app;
GRANT SELECT ON public_holidays TO andaime_app;

CREATE INDEX public_holidays_date_idx ON public_holidays (holiday_date, country) WHERE region = '';

CREATE FUNCTION app.ensure_public_holidays(p_country char(2), p_year integer, p_holidays jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    inserted integer;
BEGIN
    IF p_country IS NULL OR p_country !~ '^[A-Z]{2}$' THEN
        RAISE EXCEPTION 'País inválido: %', p_country USING ERRCODE = '22023';
    END IF;
    IF p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200 THEN
        RAISE EXCEPTION 'Ano inválido: %', p_year USING ERRCODE = '22023';
    END IF;
    IF p_holidays IS NULL OR jsonb_typeof(p_holidays) <> 'array' OR jsonb_array_length(p_holidays) > 40 THEN
        RAISE EXCEPTION 'Lista de feriados inválida' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_holidays) item
        WHERE (item ->> 'date') IS NULL
           OR extract(year FROM (item ->> 'date')::date) <> p_year
           OR length(btrim(coalesce(item ->> 'name', ''))) NOT BETWEEN 1 AND 160
    ) THEN
        RAISE EXCEPTION 'Feriado fora do ano % ou sem nome', p_year USING ERRCODE = '22023';
    END IF;

    INSERT INTO public_holidays (country, region, holiday_date, name)
    SELECT p_country, '', (item ->> 'date')::date, btrim(item ->> 'name')
    FROM jsonb_array_elements(p_holidays) item
    ON CONFLICT (country, region, holiday_date) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    RETURN inserted;
END
$$;

REVOKE ALL ON FUNCTION app.ensure_public_holidays(char(2), integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ensure_public_holidays(char(2), integer, jsonb) TO andaime_app;
