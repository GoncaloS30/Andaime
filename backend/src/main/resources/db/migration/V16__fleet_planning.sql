-- Viaturas, ligação equipa ↔ viatura, atribuições (planeamento) e change-sets (F3).

CREATE TABLE vehicles (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    plate text NOT NULL CHECK (plate ~ '^[A-Z0-9][A-Z0-9-]{1,14}$'),
    make text CHECK (make IS NULL OR length(make) <= 60),
    model text CHECK (model IS NULL OR length(model) <= 60),
    seats integer NOT NULL CHECK (seats BETWEEN 1 AND 60),
    status text NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'WORKSHOP', 'INACTIVE')),
    km integer NOT NULL DEFAULT 0 CHECK (km >= 0),
    insurance_until date,
    inspection_until date,
    maintenance_due date,
    notes text CHECK (notes IS NULL OR length(notes) <= 1000),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT vehicles_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT vehicles_org_plate_uk UNIQUE (organization_id, plate)
);

CREATE TRIGGER vehicles_touch_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE vehicle_unavailability (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 300),
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vehicle_unavailability_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT vehicle_unavailability_vehicle_fk
        FOREIGN KEY (organization_id, vehicle_id) REFERENCES vehicles (organization_id, id),
    CONSTRAINT vehicle_unavailability_dates_ck CHECK (ends_on >= starts_on)
);

CREATE INDEX vehicle_unavailability_vehicle_idx ON vehicle_unavailability (organization_id, vehicle_id, starts_on);

-- Viatura habitual de cada equipa, com períodos (o histórico mantém-se). valid_to inclusivo.
CREATE TABLE team_vehicle_links (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT team_vehicle_links_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT team_vehicle_links_team_fk FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id),
    CONSTRAINT team_vehicle_links_vehicle_fk FOREIGN KEY (organization_id, vehicle_id) REFERENCES vehicles (organization_id, id),
    CONSTRAINT team_vehicle_links_dates_ck CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT team_vehicle_links_one_vehicle_per_team EXCLUDE USING gist (
        organization_id WITH =, team_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&),
    CONSTRAINT team_vehicle_links_one_team_per_vehicle EXCLUDE USING gist (
        organization_id WITH =, vehicle_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&)
);

-- Atribuição: um trabalhador numa obra num dia, com hora local da obra. O período absoluto
-- (tstzrange) é calculado a partir do fuso da obra; fim <= início significa o dia seguinte.
CREATE TABLE assignments (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    site_id uuid NOT NULL,
    work_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    break_min integer NOT NULL DEFAULT 0 CHECK (break_min BETWEEN 0 AND 600),
    planned_min integer NOT NULL CHECK (planned_min BETWEEN 0 AND 1440),
    site_timezone text NOT NULL,
    period tstzrange NOT NULL,
    team_id uuid,
    vehicle_id uuid,
    is_foreman boolean NOT NULL DEFAULT false,
    note text CHECK (note IS NULL OR length(note) <= 500),
    batch_id uuid,
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT assignments_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT assignments_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT assignments_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id),
    CONSTRAINT assignments_team_fk FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id),
    CONSTRAINT assignments_vehicle_fk FOREIGN KEY (organization_id, vehicle_id) REFERENCES vehicles (organization_id, id),
    CONSTRAINT assignments_times_ck CHECK (start_time <> end_time),
    -- Impossibilidades físicas: verificadas no fim da transação (comandos em lote) e, antes disso,
    -- pela deteção de conflitos do serviço, que as devolve como conflitos bloqueantes.
    CONSTRAINT assignments_employee_no_overlap EXCLUDE USING gist (
        organization_id WITH =, employee_id WITH =, period WITH &&) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT assignments_vehicle_one_site EXCLUDE USING gist (
        organization_id WITH =, vehicle_id WITH =, period WITH &&, site_id WITH <>)
        WHERE (vehicle_id IS NOT NULL) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX assignments_org_date_idx ON assignments (organization_id, work_date);
CREATE INDEX assignments_org_site_date_idx ON assignments (organization_id, site_id, work_date);
CREATE INDEX assignments_org_employee_date_idx ON assignments (organization_id, employee_id, work_date);
CREATE INDEX assignments_org_vehicle_date_idx ON assignments (organization_id, vehicle_id, work_date) WHERE vehicle_id IS NOT NULL;

CREATE FUNCTION app.assignment_period()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    zone text;
BEGIN
    SELECT timezone INTO zone FROM sites WHERE organization_id = NEW.organization_id AND id = NEW.site_id;
    IF zone IS NULL THEN
        RAISE EXCEPTION 'site % not found', NEW.site_id USING ERRCODE = '23503';
    END IF;
    NEW.site_timezone := zone;
    NEW.period := tstzrange(
        (NEW.work_date + NEW.start_time) AT TIME ZONE zone,
        (NEW.work_date + NEW.end_time
            + CASE WHEN NEW.end_time <= NEW.start_time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE zone,
        '[)');
    RETURN NEW;
END
$$;

CREATE TRIGGER assignments_period
BEFORE INSERT OR UPDATE OF site_id, work_date, start_time, end_time ON assignments
FOR EACH ROW EXECUTE FUNCTION app.assignment_period();

CREATE TRIGGER assignments_touch_updated_at
BEFORE UPDATE ON assignments
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- "Anular": cada comando de planeamento guarda as imagens antes/depois e a versão final.
CREATE TABLE planning_change_sets (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    actor_user_id uuid NOT NULL REFERENCES users (id),
    kind text NOT NULL,
    label text NOT NULL CHECK (length(label) <= 200),
    reverts_change_set_id uuid,
    reverted_by_change_set_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT planning_change_sets_org_id_uk UNIQUE (organization_id, id)
);

CREATE INDEX planning_change_sets_actor_idx ON planning_change_sets (organization_id, actor_user_id, created_at DESC);

CREATE TABLE planning_change_items (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    change_set_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    op text NOT NULL CHECK (op IN ('CREATE', 'UPDATE', 'DELETE')),
    before jsonb,
    after jsonb,
    after_version integer,
    CONSTRAINT planning_change_items_set_fk
        FOREIGN KEY (organization_id, change_set_id) REFERENCES planning_change_sets (organization_id, id) ON DELETE CASCADE
);

CREATE INDEX planning_change_items_set_idx ON planning_change_items (organization_id, change_set_id);

-- Regras novas (configuráveis por empresa) e valores por omissão para as empresas existentes.
INSERT INTO conflict_rule_settings (organization_id, rule, severity)
SELECT organization.id, rule.name, rule.severity
FROM organizations organization
CROSS JOIN (VALUES ('VEHICLE_UNAVAILABLE', 'BLOCK'), ('SITE_HOUR_LIMIT', 'WARN')) AS rule (name, severity)
ON CONFLICT DO NOTHING;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicles_tenant_policy ON vehicles
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE vehicle_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_unavailability FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_unavailability_tenant_policy ON vehicle_unavailability
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE team_vehicle_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_vehicle_links FORCE ROW LEVEL SECURITY;
CREATE POLICY team_vehicle_links_tenant_policy ON team_vehicle_links
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY assignments_tenant_policy ON assignments
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE planning_change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_change_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY planning_change_sets_tenant_policy ON planning_change_sets
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE planning_change_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_change_items FORCE ROW LEVEL SECURITY;
CREATE POLICY planning_change_items_tenant_policy ON planning_change_items
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles, vehicle_unavailability, team_vehicle_links, assignments,
    planning_change_sets, planning_change_items TO andaime_app;
GRANT SELECT ON vehicles, assignments TO andaime_platform;
