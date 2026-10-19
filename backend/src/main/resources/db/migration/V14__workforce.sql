-- Trabalhadores, contratos, equipas e composição datada das equipas (F2).
-- Todas as referências entre tabelas de empresa usam FKs compostas (organization_id, id).

CREATE TABLE employees (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    number text NOT NULL CHECK (length(btrim(number)) BETWEEN 1 AND 20),
    full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 160),
    category text NOT NULL CHECK (length(btrim(category)) BETWEEN 2 AND 60),
    phone text CHECK (phone IS NULL OR length(phone) <= 40),
    email text CHECK (email IS NULL OR length(email) <= 254),
    nationality text CHECK (nationality IS NULL OR length(nationality) <= 60),
    home_city text CHECK (home_city IS NULL OR length(home_city) <= 80),
    hire_date date,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    daily_capacity_min integer NOT NULL DEFAULT 480 CHECK (daily_capacity_min BETWEEN 60 AND 960),
    hourly_cost numeric(10, 2) CHECK (hourly_cost IS NULL OR hourly_cost >= 0),
    skills text[] NOT NULL DEFAULT '{}',
    sizes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sizes) = 'object'),
    notes text CHECK (notes IS NULL OR length(notes) <= 2000),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT employees_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT employees_org_number_uk UNIQUE (organization_id, number)
);

CREATE INDEX employees_org_name_idx ON employees (organization_id, lower(full_name));
CREATE INDEX employees_org_status_idx ON employees (organization_id, status) WHERE archived_at IS NULL;

CREATE TRIGGER employees_touch_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE employee_contracts (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('PERMANENT', 'FIXED_TERM', 'TEMPORARY', 'POSTED', 'OTHER')),
    start_date date NOT NULL,
    end_date date,
    weekly_min integer CHECK (weekly_min IS NULL OR weekly_min BETWEEN 60 AND 4800),
    notes text CHECK (notes IS NULL OR length(notes) <= 1000),
    created_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT employee_contracts_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT employee_contracts_employee_fk
        FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT employee_contracts_dates_ck CHECK (end_date IS NULL OR end_date >= start_date),
    -- Um trabalhador não pode ter dois contratos em vigor no mesmo dia.
    CONSTRAINT employee_contracts_no_overlap EXCLUDE USING gist (
        organization_id WITH =,
        employee_id WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

CREATE TABLE teams (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    foreman_employee_id uuid,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT teams_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT teams_foreman_fk
        FOREIGN KEY (organization_id, foreman_employee_id) REFERENCES employees (organization_id, id)
);

CREATE UNIQUE INDEX teams_org_name_uk ON teams (organization_id, lower(name)) WHERE archived_at IS NULL;

CREATE TRIGGER teams_touch_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Composição datada: uma alteração nunca apaga as semanas anteriores; um trabalhador
-- está no máximo numa equipa em cada dia. left_on é o último dia na equipa (inclusivo).
CREATE TABLE team_members (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    joined_on date NOT NULL,
    left_on date,
    created_by_user_id uuid REFERENCES users (id),
    ended_by_user_id uuid REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT team_members_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT team_members_team_fk
        FOREIGN KEY (organization_id, team_id) REFERENCES teams (organization_id, id),
    CONSTRAINT team_members_employee_fk
        FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id),
    CONSTRAINT team_members_dates_ck CHECK (left_on IS NULL OR left_on >= joined_on),
    CONSTRAINT team_members_one_team_per_day EXCLUDE USING gist (
        organization_id WITH =,
        employee_id WITH =,
        daterange(joined_on, left_on, '[]') WITH &&
    )
);

CREATE INDEX team_members_team_idx ON team_members (organization_id, team_id, joined_on);

-- Ligação de uma conta (membership) à ficha do trabalhador: dá ao encarregado e ao
-- trabalhador o seu âmbito (as suas equipas, os seus dados).
ALTER TABLE memberships ADD COLUMN employee_id uuid;
ALTER TABLE memberships
    ADD CONSTRAINT memberships_employee_fk
    FOREIGN KEY (organization_id, employee_id) REFERENCES employees (organization_id, id);
CREATE UNIQUE INDEX memberships_org_employee_uk
    ON memberships (organization_id, employee_id) WHERE employee_id IS NOT NULL;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
CREATE POLICY employees_tenant_policy ON employees
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE employee_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_contracts_tenant_policy ON employee_contracts
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams FORCE ROW LEVEL SECURITY;
CREATE POLICY teams_tenant_policy ON teams
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members FORCE ROW LEVEL SECURITY;
CREATE POLICY team_members_tenant_policy ON team_members
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

-- Permissões explícitas (não dependem de quem executa a migração).
GRANT SELECT, INSERT, UPDATE, DELETE ON employees, employee_contracts, teams, team_members TO andaime_app;
GRANT SELECT ON employees, teams, team_members TO andaime_platform;
