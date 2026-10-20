-- Agenda (F8.6): eventos próprios da empresa (reuniões, visitas, entregas). As restantes camadas da agenda
-- (ausências, datas das obras, validades e feriados) leem-se das tabelas de origem e não se copiam para aqui.
-- A sincronização com o Google Calendar (origem e identificador externo) fica para uma fase própria.

CREATE TABLE calendar_events (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    start_time time,
    location text CHECK (location IS NULL OR length(location) <= 160),
    created_by_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT calendar_events_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT calendar_events_dates_ck CHECK (ends_on >= starts_on AND ends_on - starts_on <= 366)
);

CREATE INDEX calendar_events_org_dates_idx ON calendar_events (organization_id, starts_on, ends_on);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_tenant_policy ON calendar_events
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, DELETE ON calendar_events TO andaime_app;
