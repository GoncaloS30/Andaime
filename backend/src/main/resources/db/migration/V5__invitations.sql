CREATE TABLE invitations (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    email citext NOT NULL,
    role text NOT NULL
        CHECK (role IN ('OWNER', 'ADMIN', 'MANAGER', 'FOREMAN', 'WORKER')),
    token_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    revoked_at timestamptz,
    invited_by_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT invitations_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT invitations_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT invitations_token_hash_uk UNIQUE (token_hash),
    CONSTRAINT invitations_terminal_state_ck
        CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX invitations_pending_org_email_uk
    ON invitations (organization_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX invitations_org_expires_idx
    ON invitations (organization_id, expires_at)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TRIGGER invitations_touch_updated_at
BEFORE UPDATE ON invitations
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_policy ON invitations
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());
