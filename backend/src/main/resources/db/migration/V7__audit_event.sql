CREATE TABLE audit_event (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_user_id uuid REFERENCES users (id),
    actor_role text,
    on_behalf boolean NOT NULL DEFAULT false,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_id varchar(128),
    ip inet,
    CONSTRAINT audit_event_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT audit_event_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT audit_event_actor_role_ck CHECK (
        actor_role IS NULL OR actor_role IN (
            'OWNER', 'ADMIN', 'MANAGER', 'FOREMAN', 'WORKER', 'PLATFORM_ADMIN', 'SYSTEM'
        )
    )
);

CREATE INDEX audit_event_org_occurred_idx
    ON audit_event (organization_id, occurred_at DESC);
CREATE INDEX audit_event_org_entity_idx
    ON audit_event (organization_id, entity_type, entity_id);
CREATE INDEX audit_event_actor_idx
    ON audit_event (actor_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION app.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is append-only'
        USING ERRCODE = '42501';
END
$$;

CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_event_select_policy ON audit_event
    FOR SELECT
    USING (organization_id = app.current_org_id());
CREATE POLICY audit_event_insert_policy ON audit_event
    FOR INSERT
    WITH CHECK (
        organization_id = app.current_org_id()
        OR (organization_id IS NULL AND actor_user_id = app.current_user_id())
    );
