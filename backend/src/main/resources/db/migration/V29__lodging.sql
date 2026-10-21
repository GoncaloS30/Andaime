-- F8.4: dormidas e hotéis. Hotéis por obra e estadias por semana (pessoa × obra × semana). As datas propostas, as
-- noites e a sugestão "longe de casa" calculam-se na leitura (módulo lodging); aqui fica só o que alguém decidiu.

-- Residência do trabalhador em coordenadas (cidade, não morada): base da sugestão "longe de casa".
ALTER TABLE employees
    ADD COLUMN home_latitude numeric(9, 6) CHECK (home_latitude IS NULL OR home_latitude BETWEEN -90 AND 90),
    ADD COLUMN home_longitude numeric(9, 6) CHECK (home_longitude IS NULL OR home_longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT employees_home_coordinates_ck CHECK ((home_latitude IS NULL) = (home_longitude IS NULL));

CREATE TABLE hotels (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    site_id uuid NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
    address text CHECK (address IS NULL OR length(address) <= 300),
    contact text CHECK (contact IS NULL OR length(contact) <= 120),
    notes text CHECK (notes IS NULL OR length(notes) <= 1000),
    -- Remover um hotel arquiva-o: as estadias em curso e futuras passam a "hotel por definir"; as passadas guardam-no.
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT hotels_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT hotels_org_site_id_uk UNIQUE (organization_id, site_id, id),
    CONSTRAINT hotels_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id)
);
-- Nome único na obra, sem olhar a acentos nem maiúsculas ("Hotel São João" = "hotel sao joao").
CREATE UNIQUE INDEX hotels_site_name_uk ON hotels (organization_id, site_id, app.fold_name(name)) WHERE archived_at IS NULL;

CREATE TRIGGER hotels_touch_updated_at BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE stays (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    employee_id uuid NOT NULL,
    site_id uuid NOT NULL,
    -- Segunda-feira da semana da escala a que a estadia pertence.
    week date NOT NULL CHECK (extract(isodow FROM week) = 1),
    -- Nulo = "hotel por definir".
    hotel_id uuid,
    check_in date NOT NULL,
    check_out date NOT NULL,
    notes text CHECK (notes IS NULL OR length(notes) <= 500),
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT stays_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT stays_employee_site_week_uk UNIQUE (organization_id, employee_id, site_id, week),
    CONSTRAINT stays_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT stays_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id),
    -- O hotel tem de ser da mesma obra (com hotel_id nulo a chave não é verificada).
    CONSTRAINT stays_hotel_fk FOREIGN KEY (organization_id, site_id, hotel_id) REFERENCES hotels (organization_id, site_id, id),
    CONSTRAINT stays_dates_ck CHECK (check_out > check_in AND check_out - check_in <= 14
        AND check_in BETWEEN week - 7 AND week + 6)
);
CREATE INDEX stays_org_week_idx ON stays (organization_id, week);
CREATE INDEX stays_employee_idx ON stays (organization_id, employee_id, check_in DESC);
CREATE INDEX stays_hotel_idx ON stays (organization_id, hotel_id) WHERE hotel_id IS NOT NULL;

CREATE TRIGGER stays_touch_updated_at BEFORE UPDATE ON stays FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- --- RLS e permissões ------------------------------------------------------------------------------------

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels FORCE ROW LEVEL SECURITY;
CREATE POLICY hotels_tenant_policy ON hotels
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE stays FORCE ROW LEVEL SECURITY;
CREATE POLICY stays_tenant_policy ON stays
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE ON hotels TO andaime_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON stays TO andaime_app;
