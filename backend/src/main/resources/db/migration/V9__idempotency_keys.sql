CREATE TABLE idempotency_keys (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES users (id),
    idempotency_key uuid NOT NULL,
    request_hash bytea NOT NULL,
    response_status integer,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT idempotency_keys_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT idempotency_keys_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT idempotency_keys_org_user_key_uk
        UNIQUE (organization_id, user_id, idempotency_key),
    CONSTRAINT idempotency_keys_response_ck CHECK (
        (response_status IS NULL AND response_body IS NULL)
        OR (response_status BETWEEN 100 AND 599)
    )
);

CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant_policy ON idempotency_keys
    USING (organization_id = app.current_org_id())
    WITH CHECK (
        organization_id = app.current_org_id()
        AND user_id = app.current_user_id()
    );
