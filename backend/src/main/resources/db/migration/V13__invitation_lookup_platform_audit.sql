-- Leitura de um convite pelo hash do token, antes de existir membership.
-- SECURITY DEFINER com âmbito mínimo: só devolve o convite cujo hash foi fornecido.
CREATE FUNCTION app.invitation_by_token_hash(p_token_hash bytea)
RETURNS TABLE (
    id uuid,
    organization_id uuid,
    organization_name text,
    organization_status text,
    email text,
    role text,
    expires_at timestamptz,
    accepted_at timestamptz,
    revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT invitation.id, invitation.organization_id, organization.name, organization.status,
           invitation.email::text, invitation.role, invitation.expires_at,
           invitation.accepted_at, invitation.revoked_at
    FROM invitations invitation
    JOIN organizations organization ON organization.id = invitation.organization_id
    WHERE invitation.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION app.invitation_by_token_hash(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.invitation_by_token_hash(bytea) TO andaime_app;

-- A administração da plataforma regista as suas ações na auditoria da organização visada.
GRANT INSERT ON audit_event TO andaime_platform;
CREATE POLICY audit_event_platform_insert_policy ON audit_event
    FOR INSERT TO andaime_platform
    WITH CHECK (actor_role = 'PLATFORM_ADMIN');
