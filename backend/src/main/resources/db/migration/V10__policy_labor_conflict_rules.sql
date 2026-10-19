CREATE TABLE labor_policies (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    country char(2),
    effective_during daterange NOT NULL,
    daily_normal_min integer NOT NULL CHECK (daily_normal_min > 0),
    weekly_normal_min integer NOT NULL CHECK (weekly_normal_min > 0),
    rest_days smallint[] NOT NULL DEFAULT ARRAY[6, 7]::smallint[],
    holidays_are_rest boolean NOT NULL DEFAULT true,
    auto_break_after_min integer CHECK (auto_break_after_min > 0),
    auto_break_min integer CHECK (auto_break_min > 0),
    overnight_attribution text NOT NULL DEFAULT 'START_DAY'
        CHECK (overnight_attribution IN ('START_DAY', 'SPLIT_MIDNIGHT')),
    overtime_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
    normal_code text NOT NULL DEFAULT '800',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT labor_policies_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT labor_policies_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT labor_policies_country_ck
        CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
    CONSTRAINT labor_policies_range_ck CHECK (NOT isempty(effective_during)),
    CONSTRAINT labor_policies_rest_days_ck CHECK (
        rest_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
    ),
    CONSTRAINT labor_policies_break_ck CHECK (
        (auto_break_after_min IS NULL) = (auto_break_min IS NULL)
    ),
    CONSTRAINT labor_policies_no_overlap EXCLUDE USING gist (
        organization_id WITH =,
        (COALESCE(country, '')) WITH =,
        effective_during WITH &&
    )
);

CREATE TRIGGER labor_policies_touch_updated_at
BEFORE UPDATE ON labor_policies
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE public_holidays (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    region text NOT NULL DEFAULT '',
    holiday_date date NOT NULL,
    name text NOT NULL,
    CONSTRAINT public_holidays_country_region_date_uk
        UNIQUE (country, region, holiday_date)
);

CREATE TABLE org_holidays (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    holiday_date date NOT NULL,
    name text NOT NULL,
    country char(2),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT org_holidays_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT org_holidays_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT org_holidays_org_date_name_uk
        UNIQUE (organization_id, holiday_date, name),
    CONSTRAINT org_holidays_country_ck
        CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

CREATE TABLE conflict_rule_settings (
    organization_id uuid NOT NULL,
    rule text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('BLOCK', 'WARN', 'OFF')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT conflict_rule_settings_pk PRIMARY KEY (organization_id, rule),
    CONSTRAINT conflict_rule_settings_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id)
);

CREATE TRIGGER conflict_rule_settings_touch_updated_at
BEFORE UPDATE ON conflict_rule_settings
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE labor_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY labor_policies_tenant_policy ON labor_policies
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE org_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_holidays FORCE ROW LEVEL SECURITY;
CREATE POLICY org_holidays_tenant_policy ON org_holidays
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

ALTER TABLE conflict_rule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_rule_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY conflict_rule_settings_tenant_policy ON conflict_rule_settings
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());
