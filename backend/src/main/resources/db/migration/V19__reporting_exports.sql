-- Fila persistente de exportações F6. O conteúdo fica em PostgreSQL até o storage S3 de F5 estar disponível.

CREATE TABLE report_exports (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL REFERENCES organizations (id),
    requested_by_user_id uuid NOT NULL REFERENCES users (id),
    kind text NOT NULL CHECK (kind IN ('WEEKLY_MAP')),
    template text NOT NULL CHECK (template IN ('EQUIPA', 'OBRA', 'HORAS', 'ERP')),
    parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'READY', 'FAILED', 'EXPIRED')),
    filename text,
    content_type text,
    content bytea,
    content_size bigint CHECK (content_size IS NULL OR content_size >= 0),
    error_code text,
    error_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT report_exports_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT report_exports_ready_ck CHECK (
        (status = 'READY') = (content IS NOT NULL AND filename IS NOT NULL AND content_type IS NOT NULL)),
    CONSTRAINT report_exports_failed_ck CHECK ((status = 'FAILED') = (error_code IS NOT NULL))
);

CREATE INDEX report_exports_org_created_idx ON report_exports (organization_id, created_at DESC);
CREATE INDEX report_exports_pending_idx ON report_exports (created_at) WHERE status IN ('PENDING', 'RUNNING');

CREATE TRIGGER report_exports_touch_updated_at
BEFORE UPDATE ON report_exports
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY report_exports_tenant_policy ON report_exports
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON report_exports TO andaime_app;

-- O worker precisa reclamar um job antes de conhecer o tenant. A função é mínima, atómica,
-- executa como o owner BYPASSRLS e só devolve os IDs necessários para abrir o TenantContext.
CREATE FUNCTION app.claim_report_export()
RETURNS TABLE (job_id uuid, organization_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE report_exports
       SET status = 'EXPIRED', content = NULL, content_size = NULL, updated_at = now()
     WHERE status = 'READY' AND expires_at <= now();

    RETURN QUERY
    WITH candidate AS (
        SELECT export.id
          FROM report_exports export
         WHERE export.status = 'PENDING'
            OR (export.status = 'RUNNING' AND export.started_at < now() - interval '15 minutes')
         ORDER BY export.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
    ), claimed AS (
        UPDATE report_exports export
           SET status = 'RUNNING', started_at = now(), finished_at = NULL,
               error_code = NULL, error_detail = NULL, updated_at = now()
          FROM candidate
         WHERE export.id = candidate.id
        RETURNING export.id, export.organization_id, export.requested_by_user_id
    )
    SELECT claimed.id, claimed.organization_id, claimed.requested_by_user_id FROM claimed;
END
$$;

REVOKE ALL ON FUNCTION app.claim_report_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_report_export() TO andaime_app;
