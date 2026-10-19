-- Clientes, obras e ocorrências de obra (F2).

CREATE TABLE clients (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
    tax_id text CHECK (tax_id IS NULL OR length(tax_id) <= 40),
    contact_name text CHECK (contact_name IS NULL OR length(contact_name) <= 120),
    email text CHECK (email IS NULL OR length(email) <= 254),
    phone text CHECK (phone IS NULL OR length(phone) <= 40),
    country char(2) CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT clients_org_id_uk UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX clients_org_tax_uk ON clients (organization_id, tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX clients_org_name_idx ON clients (organization_id, lower(name));

CREATE TRIGGER clients_touch_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE sites (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
    client_id uuid,
    country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    city text CHECK (city IS NULL OR length(city) <= 80),
    address text CHECK (address IS NULL OR length(address) <= 300),
    latitude numeric(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude numeric(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    timezone text NOT NULL,
    status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'SUSPENDED', 'DONE')),
    start_date date,
    end_date date,
    hour_limit_min integer CHECK (hour_limit_min IS NULL OR hour_limit_min > 0),
    baseline_realized_min integer NOT NULL DEFAULT 0 CHECK (baseline_realized_min >= 0),
    baseline_approved_min integer NOT NULL DEFAULT 0 CHECK (baseline_approved_min >= 0),
    director_user_id uuid REFERENCES users (id),
    foreman_employee_id uuid,
    color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    description text CHECK (description IS NULL OR length(description) <= 2000),
    erp_order text CHECK (erp_order IS NULL OR length(erp_order) <= 40),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT sites_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT sites_org_code_uk UNIQUE (organization_id, code),
    CONSTRAINT sites_client_fk FOREIGN KEY (organization_id, client_id) REFERENCES clients (organization_id, id),
    CONSTRAINT sites_foreman_fk
        FOREIGN KEY (organization_id, foreman_employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT sites_dates_ck CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT sites_coordinates_ck CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT sites_baseline_ck CHECK (baseline_approved_min <= baseline_realized_min)
);

CREATE INDEX sites_org_status_idx ON sites (organization_id, status) WHERE archived_at IS NULL;

CREATE TRIGGER sites_touch_updated_at
BEFORE UPDATE ON sites
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- O fuso é interpretado pelo PostgreSQL ao calcular horários (F3/F4): tem de ser um nome IANA válido.
CREATE FUNCTION app.check_site_timezone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
        RAISE EXCEPTION 'invalid timezone %', NEW.timezone USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER sites_check_timezone
BEFORE INSERT OR UPDATE OF timezone ON sites
FOR EACH ROW EXECUTE FUNCTION app.check_site_timezone();

CREATE TABLE site_issues (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    site_id uuid NOT NULL,
    reported_by_user_id uuid NOT NULL REFERENCES users (id),
    category text NOT NULL CHECK (category IN ('SAFETY', 'MATERIAL', 'EQUIPMENT', 'ACCESS', 'OTHER')),
    description text NOT NULL CHECK (length(btrim(description)) BETWEEN 3 AND 2000),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    resolved_at timestamptz,
    resolved_by_user_id uuid REFERENCES users (id),
    resolution_note text CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT site_issues_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT site_issues_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id),
    CONSTRAINT site_issues_resolution_ck CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL))
);

CREATE INDEX site_issues_site_idx ON site_issues (organization_id, site_id, created_at DESC);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_tenant_policy ON clients
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
CREATE POLICY sites_tenant_policy ON sites
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE site_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY site_issues_tenant_policy ON site_issues
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

-- Permissões explícitas (não dependem de quem executa a migração).
GRANT SELECT, INSERT, UPDATE, DELETE ON clients, sites, site_issues TO andaime_app;
GRANT SELECT ON clients, sites TO andaime_platform;
