-- Projeções F6. Os módulos de origem publicam apenas factos já decididos/aprovados;
-- reporting nunca recalcula regras laborais nem lê ficheiros privados.

CREATE TABLE reporting_time_facts (
    organization_id uuid NOT NULL REFERENCES organizations (id),
    source_entry_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    site_id uuid NOT NULL,
    team_id uuid,
    work_date date NOT NULL,
    clock_in time,
    clock_out time,
    worked_min integer NOT NULL CHECK (worked_min >= 0),
    normal_min integer NOT NULL CHECK (normal_min >= 0),
    overtime_min integer NOT NULL CHECK (overtime_min >= 0),
    activity_code text NOT NULL CHECK (length(btrim(activity_code)) BETWEEN 1 AND 40),
    approved_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reporting_time_facts_pk PRIMARY KEY (organization_id, source_entry_id),
    CONSTRAINT reporting_time_facts_employee_fk
        FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT reporting_time_facts_site_fk
        FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id),
    CONSTRAINT reporting_time_facts_team_fk
        FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id),
    CONSTRAINT reporting_time_facts_minutes_ck CHECK (normal_min + overtime_min = worked_min),
    CONSTRAINT reporting_time_facts_clock_ck CHECK ((clock_in IS NULL) = (clock_out IS NULL))
);

CREATE INDEX reporting_time_facts_date_idx ON reporting_time_facts (organization_id, work_date);
CREATE INDEX reporting_time_facts_employee_date_idx ON reporting_time_facts (organization_id, employee_id, work_date);
CREATE INDEX reporting_time_facts_site_date_idx ON reporting_time_facts (organization_id, site_id, work_date);

CREATE TABLE reporting_document_facts (
    organization_id uuid NOT NULL REFERENCES organizations (id),
    source_document_id uuid NOT NULL,
    owner_kind text NOT NULL CHECK (owner_kind IN ('EMPLOYEE', 'VEHICLE', 'SITE', 'COMPANY')),
    owner_id uuid,
    document_type_name text NOT NULL CHECK (length(btrim(document_type_name)) BETWEEN 1 AND 160),
    country char(2) CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
    status text NOT NULL CHECK (status IN ('VALID', 'EXPIRING', 'PENDING', 'EXPIRED', 'REJECTED', 'MISSING')),
    expires_on date,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reporting_document_facts_pk PRIMARY KEY (organization_id, source_document_id),
    CONSTRAINT reporting_document_facts_owner_ck CHECK (
        (owner_kind = 'COMPANY' AND owner_id IS NULL) OR (owner_kind <> 'COMPANY' AND owner_id IS NOT NULL))
);

CREATE INDEX reporting_document_facts_status_idx ON reporting_document_facts (organization_id, status);
CREATE INDEX reporting_document_facts_expiry_idx ON reporting_document_facts (organization_id, expires_on)
    WHERE expires_on IS NOT NULL;

ALTER TABLE reporting_time_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_time_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY reporting_time_facts_tenant_policy ON reporting_time_facts
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE reporting_document_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_document_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY reporting_document_facts_tenant_policy ON reporting_document_facts
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON reporting_time_facts, reporting_document_facts TO andaime_app;
