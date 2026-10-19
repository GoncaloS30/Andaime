CREATE TABLE support_access_grants (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    platform_user_id uuid NOT NULL REFERENCES users (id),
    granted_by_user_id uuid NOT NULL REFERENCES users (id),
    reason text NOT NULL CHECK (length(trim(reason)) >= 10),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT support_access_grants_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT support_access_grants_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT support_access_grants_expiry_ck CHECK (expires_at > created_at),
    CONSTRAINT support_access_grants_revoke_ck
        CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX support_access_grants_active_idx
    ON support_access_grants (organization_id, platform_user_id, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_access_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access_grants_tenant_policy ON support_access_grants
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA public, app TO andaime_app, andaime_platform;
GRANT EXECUTE ON FUNCTION app.current_org_id() TO andaime_app, andaime_platform;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO andaime_app, andaime_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO andaime_app;
REVOKE UPDATE, DELETE ON audit_event FROM andaime_app;

GRANT SELECT ON users, platform_admins, organizations, memberships TO andaime_platform;
GRANT UPDATE (status, updated_at, version) ON organizations TO andaime_platform;
GRANT SELECT, INSERT, UPDATE ON support_access_grants TO andaime_platform;

ALTER DEFAULT PRIVILEGES FOR ROLE andaime_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO andaime_app;
ALTER DEFAULT PRIVILEGES FOR ROLE andaime_owner IN SCHEMA public
    GRANT SELECT ON TABLES TO andaime_platform;

REVOKE UPDATE, DELETE ON audit_event FROM andaime_owner;
