-- F4: registo de horas (ponto), correções como revisões e folhas semanais com aprovação.
-- Instantes em timestamptz; o fuso da obra fica gravado para mostrar e atribuir o dia local.

-- Registo bruto do ponto: só acrescento, idempotente por chave do dispositivo.
CREATE TABLE clock_events (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('IN', 'BREAK_START', 'BREAK_END', 'OUT')),
    occurred_at timestamptz NOT NULL,
    device_time timestamptz,
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 100),
    site_id uuid,
    time_entry_id uuid,
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT clock_events_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT clock_events_idempotency_uk UNIQUE (organization_id, employee_id, idempotency_key),
    CONSTRAINT clock_events_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT clock_events_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id)
);

CREATE TABLE timesheets (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    submitted_at timestamptz,
    submitted_by_user_id uuid REFERENCES users (id),
    decided_at timestamptz,
    decided_by_user_id uuid REFERENCES users (id),
    decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT timesheets_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT timesheets_employee_week_uk UNIQUE (organization_id, employee_id, week_start),
    CONSTRAINT timesheets_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id)
);

CREATE TABLE time_entries (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    site_id uuid NOT NULL,
    assignment_id uuid,
    work_date date NOT NULL,
    timezone text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    break_started_at timestamptz,
    break_min integer NOT NULL DEFAULT 0 CHECK (break_min BETWEEN 0 AND 1440),
    worked_min integer CHECK (worked_min BETWEEN 0 AND 1440),
    status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    source text NOT NULL CHECK (source IN ('CLOCK', 'FOREMAN', 'MANAGER')),
    note text CHECK (note IS NULL OR length(note) <= 500),
    period tstzrange GENERATED ALWAYS AS (tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz), '[)')) STORED,
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT time_entries_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT time_entries_employee_fk FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT time_entries_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id),
    CONSTRAINT time_entries_assignment_fk FOREIGN KEY (organization_id, assignment_id)
        REFERENCES assignments (organization_id, id) ON DELETE SET NULL (assignment_id),
    CONSTRAINT time_entries_order_ck CHECK (ended_at IS NULL OR ended_at > started_at),
    CONSTRAINT time_entries_max_length_ck CHECK (ended_at IS NULL OR ended_at - started_at <= interval '24 hours'),
    CONSTRAINT time_entries_closed_ck CHECK (status <> 'CLOSED' OR (ended_at IS NOT NULL AND worked_min IS NOT NULL)),
    CONSTRAINT time_entries_no_overlap EXCLUDE USING gist (
        organization_id WITH =, employee_id WITH =, period WITH &&) WHERE (status <> 'CANCELLED')
);

-- No máximo um registo aberto por trabalhador.
CREATE UNIQUE INDEX time_entries_one_open_uk ON time_entries (organization_id, employee_id) WHERE status = 'OPEN';
CREATE INDEX time_entries_org_date_idx ON time_entries (organization_id, work_date);
CREATE INDEX time_entries_org_employee_date_idx ON time_entries (organization_id, employee_id, work_date);
CREATE INDEX time_entries_org_site_idx ON time_entries (organization_id, site_id) WHERE status = 'CLOSED';

ALTER TABLE clock_events ADD CONSTRAINT clock_events_entry_fk
    FOREIGN KEY (organization_id, time_entry_id) REFERENCES time_entries (organization_id, id);

-- Correções preservam o original: cada alteração a um registo fica aqui, com motivo.
CREATE TABLE time_entry_revisions (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    time_entry_id uuid NOT NULL,
    before jsonb,
    after jsonb NOT NULL,
    reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
    user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT time_entry_revisions_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT time_entry_revisions_entry_fk FOREIGN KEY (organization_id, time_entry_id) REFERENCES time_entries (organization_id, id)
);

CREATE TRIGGER timesheets_touch_updated_at BEFORE UPDATE ON timesheets FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER time_entries_touch_updated_at BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Semana aprovada fica fechada: registos dessa semana só mudam depois de reabrir a folha (auditado).
-- SQLSTATE próprio AN001 → 409 timesheet-locked na API.
CREATE FUNCTION app.time_entry_week_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target record;
BEGIN
    FOR target IN
        SELECT * FROM (VALUES (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.employee_id END,
                               CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.work_date END),
                              (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.employee_id END,
                               CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.work_date END)) AS t (employee_id, work_date)
        WHERE employee_id IS NOT NULL
    LOOP
        IF EXISTS (SELECT 1 FROM timesheets sheet
                   WHERE sheet.organization_id = coalesce(NEW.organization_id, OLD.organization_id)
                     AND sheet.employee_id = target.employee_id
                     AND sheet.week_start = target.work_date - (extract(isodow FROM target.work_date)::int - 1)
                     AND sheet.status = 'APPROVED') THEN
            RAISE EXCEPTION 'timesheet approved for employee % week of %', target.employee_id, target.work_date
                USING ERRCODE = 'AN001';
        END IF;
    END LOOP;
    RETURN coalesce(NEW, OLD);
END
$$;

CREATE TRIGGER time_entries_week_locked
BEFORE INSERT OR UPDATE OR DELETE ON time_entries
FOR EACH ROW EXECUTE FUNCTION app.time_entry_week_locked();

ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_events FORCE ROW LEVEL SECURITY;
CREATE POLICY clock_events_tenant_policy ON clock_events
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets FORCE ROW LEVEL SECURITY;
CREATE POLICY timesheets_tenant_policy ON timesheets
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY time_entries_tenant_policy ON time_entries
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE time_entry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entry_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY time_entry_revisions_tenant_policy ON time_entry_revisions
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT ON clock_events, time_entry_revisions TO andaime_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON timesheets, time_entries TO andaime_app;
GRANT SELECT ON time_entries, timesheets TO andaime_platform;
