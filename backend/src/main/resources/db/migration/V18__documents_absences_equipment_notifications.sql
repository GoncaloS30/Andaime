-- F5: documentos (ficheiros num armazenamento S3 privado), ausências, fardamento/EPI com registo de movimentos
-- e notificações persistentes.

-- Organizações ativas, para tarefas agendadas que percorrem empresa a empresa (cada uma na sua transação com RLS).
CREATE FUNCTION app.active_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT id FROM organizations WHERE status = 'ACTIVE' ORDER BY id
$$;
REVOKE ALL ON FUNCTION app.active_org_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.active_org_ids() TO andaime_app;

-- Dono ativo de uma empresa: contexto de RLS para as tarefas agendadas dessa empresa.
CREATE FUNCTION app.organization_owner(org uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT membership.user_id FROM memberships membership
    WHERE membership.organization_id = org AND membership.role = 'OWNER' AND membership.status = 'ACTIVE'
    ORDER BY membership.created_at, membership.user_id LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.organization_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organization_owner(uuid) TO andaime_app;

-- --- documentos ------------------------------------------------------------------------------------

CREATE TABLE document_types (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
    subject text NOT NULL DEFAULT 'EMPLOYEE' CHECK (subject IN ('EMPLOYEE', 'VEHICLE')),
    requires_expiry boolean NOT NULL DEFAULT true,
    alert_days integer NOT NULL DEFAULT 30 CHECK (alert_days BETWEEN 0 AND 365),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT document_types_org_id_uk UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX document_types_name_uk ON document_types (organization_id, lower(name)) WHERE archived_at IS NULL;

-- Exigências configuráveis: um tipo de documento é obrigatório para trabalhar em obras de um país (ou em todas).
CREATE TABLE document_requirements (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    document_type_id uuid NOT NULL,
    country char(2) CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT document_requirements_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT document_requirements_type_fk FOREIGN KEY (organization_id, document_type_id) REFERENCES document_types (organization_id, id)
);
CREATE UNIQUE INDEX document_requirements_uk ON document_requirements (organization_id, document_type_id, coalesce(country, ''));

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    document_type_id uuid NOT NULL,
    employee_id uuid,
    vehicle_id uuid,
    current_version_id uuid,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT documents_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT documents_type_fk FOREIGN KEY (organization_id, document_type_id) REFERENCES document_types (organization_id, id),
    CONSTRAINT documents_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT documents_vehicle_fk FOREIGN KEY (organization_id, vehicle_id) REFERENCES vehicles (organization_id, id),
    CONSTRAINT documents_subject_ck CHECK ((employee_id IS NULL) <> (vehicle_id IS NULL))
);
-- Um documento ativo por tipo e titular; renovar = nova versão do mesmo documento.
CREATE UNIQUE INDEX documents_employee_type_uk ON documents (organization_id, employee_id, document_type_id)
    WHERE archived_at IS NULL AND employee_id IS NOT NULL;
CREATE UNIQUE INDEX documents_vehicle_type_uk ON documents (organization_id, vehicle_id, document_type_id)
    WHERE archived_at IS NULL AND vehicle_id IS NOT NULL;

CREATE TABLE document_versions (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    document_id uuid NOT NULL,
    storage_key text NOT NULL,
    filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
    content_type text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    issued_on date,
    expires_on date,
    uploaded_by_user_id uuid NOT NULL REFERENCES users (id),
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    verified_by_user_id uuid REFERENCES users (id),
    verified_at timestamptz,
    scan_status text NOT NULL DEFAULT 'NOT_SCANNED' CHECK (scan_status IN ('NOT_SCANNED', 'CLEAN', 'INFECTED')),
    CONSTRAINT document_versions_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT document_versions_storage_key_uk UNIQUE (storage_key),
    CONSTRAINT document_versions_document_fk FOREIGN KEY (organization_id, document_id) REFERENCES documents (organization_id, id),
    CONSTRAINT document_versions_dates_ck CHECK (issued_on IS NULL OR expires_on IS NULL OR expires_on >= issued_on)
);
ALTER TABLE documents ADD CONSTRAINT documents_current_version_fk
    FOREIGN KEY (organization_id, current_version_id) REFERENCES document_versions (organization_id, id);
CREATE INDEX document_versions_expiry_idx ON document_versions (organization_id, expires_on);

CREATE TRIGGER documents_touch_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Catálogo inicial de tipos (ilustrativo; validação jurídica antes de uso comercial). Nenhum é obrigatório à partida:
-- cada empresa define em Documentos → Tipos onde cada um é exigido.
CREATE FUNCTION app.seed_document_types(org uuid)
RETURNS void
LANGUAGE sql
AS $$
    INSERT INTO document_types (organization_id, name, subject, requires_expiry, alert_days) VALUES
        (org, 'Documento de identificação', 'EMPLOYEE', true, 60),
        (org, 'Ficha de aptidão médica', 'EMPLOYEE', true, 30),
        (org, 'Formação em segurança na construção', 'EMPLOYEE', true, 30),
        (org, 'Certificado A1 (destacamento)', 'EMPLOYEE', true, 30),
        (org, 'Carta de condução', 'EMPLOYEE', true, 60),
        (org, 'Seguro da viatura', 'VEHICLE', true, 30),
        (org, 'Inspeção periódica', 'VEHICLE', true, 30)
    ON CONFLICT DO NOTHING;
$$;

-- --- ausências ------------------------------------------------------------------------------------

CREATE TABLE absences (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('VACATION', 'SICK', 'TRAINING', 'PERSONAL', 'OTHER')),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    partial_minutes integer CHECK (partial_minutes IS NULL OR partial_minutes BETWEEN 15 AND 600),
    status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    note text CHECK (note IS NULL OR length(note) <= 500),
    requested_by_user_id uuid NOT NULL REFERENCES users (id),
    decided_by_user_id uuid REFERENCES users (id),
    decided_at timestamptz,
    decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT absences_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT absences_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT absences_dates_ck CHECK (ends_on >= starts_on AND ends_on - starts_on <= 366),
    CONSTRAINT absences_partial_single_day_ck CHECK (partial_minutes IS NULL OR starts_on = ends_on),
    -- Dias inteiros não se sobrepõem a outras ausências ativas do mesmo trabalhador.
    CONSTRAINT absences_no_overlap EXCLUDE USING gist (
        organization_id WITH =, employee_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
        WHERE (status IN ('REQUESTED', 'APPROVED') AND partial_minutes IS NULL)
);
CREATE INDEX absences_org_dates_idx ON absences (organization_id, starts_on, ends_on);
CREATE TRIGGER absences_touch_updated_at BEFORE UPDATE ON absences FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- --- fardamento e EPI -------------------------------------------------------------------------------

CREATE TABLE equipment_items (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
    category text NOT NULL CHECK (category IN ('PPE', 'UNIFORM', 'TOOL')),
    tracking text NOT NULL CHECK (tracking IN ('STOCK', 'SERIAL')),
    size text CHECK (size IS NULL OR length(size) <= 20),
    min_stock integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT equipment_items_org_id_uk UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX equipment_items_name_size_uk ON equipment_items (organization_id, lower(name), coalesce(size, ''))
    WHERE archived_at IS NULL;

-- Saldo de stock (artigos sem número de série). Nunca negativo.
CREATE TABLE stock_balances (
    organization_id uuid NOT NULL,
    item_id uuid NOT NULL,
    on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    PRIMARY KEY (organization_id, item_id),
    CONSTRAINT stock_balances_item_fk FOREIGN KEY (organization_id, item_id) REFERENCES equipment_items (organization_id, id)
);

CREATE TABLE equipment_units (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    item_id uuid NOT NULL,
    serial text NOT NULL CHECK (length(serial) BETWEEN 1 AND 60),
    status text NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'ASSIGNED', 'DAMAGED', 'LOST')),
    holder_employee_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT equipment_units_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT equipment_units_serial_uk UNIQUE (organization_id, serial),
    CONSTRAINT equipment_units_item_fk FOREIGN KEY (organization_id, item_id) REFERENCES equipment_items (organization_id, id),
    CONSTRAINT equipment_units_holder_fk FOREIGN KEY (organization_id, holder_employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT equipment_units_holder_ck CHECK ((status = 'ASSIGNED') = (holder_employee_id IS NOT NULL))
);

-- Registo de movimentos: só acrescento (a quantidade é sempre positiva; o tipo diz o sentido).
CREATE TABLE equipment_movements (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    item_id uuid NOT NULL,
    unit_id uuid,
    kind text NOT NULL CHECK (kind IN ('RECEIVE', 'ADJUST_IN', 'ADJUST_OUT', 'DELIVER', 'RETURN', 'DAMAGED', 'LOST')),
    quantity integer NOT NULL CHECK (quantity > 0),
    employee_id uuid,
    note text CHECK (note IS NULL OR length(note) <= 500),
    user_id uuid NOT NULL REFERENCES users (id),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT equipment_movements_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT equipment_movements_item_fk FOREIGN KEY (organization_id, item_id) REFERENCES equipment_items (organization_id, id),
    CONSTRAINT equipment_movements_unit_fk FOREIGN KEY (organization_id, unit_id) REFERENCES equipment_units (organization_id, id),
    CONSTRAINT equipment_movements_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id)
);
CREATE INDEX equipment_movements_employee_idx ON equipment_movements (organization_id, employee_id, occurred_at);

-- --- notificações -------------------------------------------------------------------------------------

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    user_id uuid NOT NULL REFERENCES users (id),
    kind text NOT NULL,
    title text NOT NULL CHECK (length(title) <= 200),
    body text CHECK (body IS NULL OR length(body) <= 1000),
    link text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
    dedupe_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz,
    CONSTRAINT notifications_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT notifications_dedupe_uk UNIQUE (organization_id, user_id, dedupe_key)
);
CREATE INDEX notifications_user_idx ON notifications (organization_id, user_id, created_at DESC);

-- --- RLS e permissões ------------------------------------------------------------------------------------

ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types FORCE ROW LEVEL SECURITY;
CREATE POLICY document_types_tenant_policy ON document_types
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY document_requirements_tenant_policy ON document_requirements
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_policy ON documents
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY document_versions_tenant_policy ON document_versions
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences FORCE ROW LEVEL SECURITY;
CREATE POLICY absences_tenant_policy ON absences
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE equipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_items FORCE ROW LEVEL SECURITY;
CREATE POLICY equipment_items_tenant_policy ON equipment_items
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_balances_tenant_policy ON stock_balances
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE equipment_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_units FORCE ROW LEVEL SECURITY;
CREATE POLICY equipment_units_tenant_policy ON equipment_units
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE equipment_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY equipment_movements_tenant_policy ON equipment_movements
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant_policy ON notifications
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON document_types, document_requirements, documents, absences, equipment_items,
    stock_balances, equipment_units, notifications TO andaime_app;
GRANT SELECT, INSERT, UPDATE ON document_versions TO andaime_app;
GRANT SELECT, INSERT ON equipment_movements TO andaime_app;
GRANT SELECT ON documents, absences TO andaime_platform;

-- Empresas existentes: catálogo inicial de tipos de documento e regras de conflito novas.
DO $$
DECLARE
    org uuid;
BEGIN
    FOR org IN SELECT id FROM organizations LOOP
        PERFORM set_config('app.org_id', org::text, true);
        PERFORM app.seed_document_types(org);
    END LOOP;
END
$$;

INSERT INTO conflict_rule_settings (organization_id, rule, severity)
SELECT organization.id, rule.name, rule.severity
FROM organizations organization
CROSS JOIN (VALUES ('ABSENCE', 'BLOCK'), ('DOCUMENT_MISSING', 'WARN')) AS rule (name, severity)
ON CONFLICT DO NOTHING;
