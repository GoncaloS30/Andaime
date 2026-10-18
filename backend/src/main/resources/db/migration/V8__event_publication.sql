CREATE TABLE event_publication (
    id uuid PRIMARY KEY,
    organization_id uuid DEFAULT app.current_org_id(),
    listener_id text NOT NULL,
    event_type text NOT NULL,
    serialized_event text NOT NULL,
    publication_date timestamptz NOT NULL,
    completion_date timestamptz,
    last_resubmission_date timestamptz,
    completion_attempts integer NOT NULL DEFAULT 0 CHECK (completion_attempts >= 0),
    status varchar(32) NOT NULL DEFAULT 'PROCESSING'
        CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'RESUBMITTED')),
    CONSTRAINT event_publication_org_fk
        FOREIGN KEY (organization_id) REFERENCES organizations (id),
    CONSTRAINT event_publication_org_id_uk UNIQUE (organization_id, id)
);

CREATE INDEX event_publication_incomplete_idx
    ON event_publication (publication_date)
    WHERE completion_date IS NULL;
CREATE INDEX event_publication_completed_idx
    ON event_publication (completion_date)
    WHERE completion_date IS NOT NULL;

ALTER TABLE event_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY event_publication_tenant_policy ON event_publication
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());
