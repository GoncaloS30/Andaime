CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    name text NOT NULL,
    legal_name text,
    tax_id text,
    country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
    default_timezone text NOT NULL DEFAULT 'Europe/Lisbon',
    currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_by_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0)
);

ALTER TABLE users
    ADD CONSTRAINT users_last_active_org_fk
    FOREIGN KEY (last_active_org_id) REFERENCES organizations (id) ON DELETE SET NULL;

CREATE TRIGGER organizations_touch_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users (id),
    role text NOT NULL
        CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'FOREMAN', 'WORKER')),
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT memberships_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT memberships_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT memberships_org_user_uk UNIQUE (organization_id, user_id)
);

CREATE INDEX memberships_user_idx ON memberships (user_id) WHERE status = 'ACTIVE';

CREATE TRIGGER memberships_touch_updated_at
BEFORE UPDATE ON memberships
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_policy ON organizations
    USING (id = app.current_org_id())
    WITH CHECK (id = app.current_org_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_select_policy ON memberships
    FOR SELECT
    USING (organization_id = app.current_org_id() OR user_id = app.current_user_id());
CREATE POLICY memberships_write_policy ON memberships
    FOR ALL
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());
