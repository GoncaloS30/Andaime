-- F7: acesso de suporte temporário. A empresa (dono ou administrador) concede acesso só de leitura a um
-- administrador da plataforma, com motivo e prazo; cada pedido feito com esse acesso fica auditado.
-- Versão 18.1 para não colidir com as migrations V19+ da F6, desenvolvida em paralelo.

-- Concessão ativa para (empresa, utilizador)? Só para administradores da plataforma e empresas ativas.
CREATE FUNCTION app.support_grant_active(org uuid, uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT grant_row.id FROM support_access_grants grant_row
    JOIN organizations organization ON organization.id = grant_row.organization_id AND organization.status = 'ACTIVE'
    WHERE grant_row.organization_id = org AND grant_row.platform_user_id = uid
      AND grant_row.revoked_at IS NULL AND grant_row.expires_at > now()
      AND EXISTS (SELECT 1 FROM platform_admins admin WHERE admin.user_id = uid)
    ORDER BY grant_row.expires_at DESC LIMIT 1
$$;

-- Empresas a que um administrador da plataforma tem acesso de suporte ativo (para /api/me).
CREATE FUNCTION app.support_grants_for(uid uuid)
RETURNS TABLE (organization_id uuid, organization_name text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT organization.id, organization.name, max(grant_row.expires_at)
    FROM support_access_grants grant_row
    JOIN organizations organization ON organization.id = grant_row.organization_id AND organization.status = 'ACTIVE'
    WHERE grant_row.platform_user_id = uid AND grant_row.revoked_at IS NULL AND grant_row.expires_at > now()
      AND EXISTS (SELECT 1 FROM platform_admins admin WHERE admin.user_id = uid)
    GROUP BY organization.id, organization.name
$$;

REVOKE ALL ON FUNCTION app.support_grant_active(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.support_grants_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.support_grant_active(uuid, uuid) TO andaime_app;
GRANT EXECUTE ON FUNCTION app.support_grants_for(uuid) TO andaime_app;

-- RGPD: ex-trabalhadores podem ser anonimizados (dados pessoais apagados; histórico de horas e planeamento mantém-se).
ALTER TABLE employees ADD COLUMN anonymized_at timestamptz;
ALTER TABLE employees ADD CONSTRAINT employees_anonymized_archived_ck CHECK (anonymized_at IS NULL OR archived_at IS NOT NULL);
