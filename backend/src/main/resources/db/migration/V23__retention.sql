-- Conservação de dados (RGPD): política por empresa (anonimização automática de ex-trabalhadores arquivados e prazo
-- das notificações), ficheiros de documentos apagados na anonimização e limpeza global de tokens, convites e
-- bloqueios de login antigos.

CREATE TABLE retention_policies (
    organization_id uuid NOT NULL,
    -- NULL = anonimização automática desligada (por omissão: é irreversível, cada empresa liga-a quando decidir).
    anonymize_after_months integer
        CHECK (anonymize_after_months IS NULL OR anonymize_after_months BETWEEN 1 AND 120),
    notifications_after_months integer NOT NULL DEFAULT 12 CHECK (notifications_after_months BETWEEN 1 AND 60),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT retention_policies_pk PRIMARY KEY (organization_id),
    CONSTRAINT retention_policies_org_fk FOREIGN KEY (organization_id) REFERENCES organizations (id)
);

CREATE TRIGGER retention_policies_touch_updated_at
BEFORE UPDATE ON retention_policies
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_tenant_policy ON retention_policies
    USING (organization_id = app.current_org_id())
    WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON retention_policies TO andaime_app;

-- Empresas existentes ficam com os valores por omissão (as novas recebem-nos na criação).
INSERT INTO retention_policies (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- Anonimizar um trabalhador apaga os ficheiros dos seus documentos do armazenamento. A versão fica (histórico e
-- hash), sem chave de armazenamento: o download responde 410 em vez de falhar no S3.
ALTER TABLE document_versions
    ALTER COLUMN storage_key DROP NOT NULL,
    ADD COLUMN purged_at timestamptz,
    ADD CONSTRAINT document_versions_purged_ck CHECK ((storage_key IS NULL) = (purged_at IS NOT NULL));

-- Índices de apoio às limpezas.
CREATE INDEX employees_archived_pending_anonymization_idx ON employees (organization_id, archived_at)
    WHERE archived_at IS NOT NULL AND anonymized_at IS NULL;
CREATE INDEX notifications_created_idx ON notifications (organization_id, created_at);
CREATE INDEX email_verification_tokens_expires_idx ON email_verification_tokens (expires_at);
CREATE INDEX password_reset_tokens_expires_idx ON password_reset_tokens (expires_at);
CREATE INDEX login_throttle_last_failure_idx ON login_throttle (last_failure_at);

-- Limpeza global (não é por empresa): tokens expirados ou usados, convites terminados ou expirados há mais de
-- 30 dias e contadores de tentativas de login antigos e sem bloqueio ativo. Os convites têm RLS, por isso a
-- função corre como o owner BYPASSRLS; só apaga e devolve contagens.
CREATE FUNCTION app.purge_expired_platform_data()
RETURNS TABLE (deleted_verification_tokens integer, deleted_reset_tokens integer, deleted_invitations integer,
               deleted_login_throttles integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM email_verification_tokens token
     WHERE token.expires_at < now() OR token.used_at < now() - interval '1 day';
    GET DIAGNOSTICS deleted_verification_tokens = ROW_COUNT;

    DELETE FROM password_reset_tokens token
     WHERE token.expires_at < now() OR token.used_at < now() - interval '1 day';
    GET DIAGNOSTICS deleted_reset_tokens = ROW_COUNT;

    DELETE FROM invitations invitation
     WHERE invitation.expires_at < now() - interval '30 days'
        OR coalesce(invitation.accepted_at, invitation.revoked_at) < now() - interval '30 days';
    GET DIAGNOSTICS deleted_invitations = ROW_COUNT;

    DELETE FROM login_throttle throttle
     WHERE throttle.last_failure_at < now() - interval '30 days'
       AND (throttle.locked_until IS NULL OR throttle.locked_until < now());
    GET DIAGNOSTICS deleted_login_throttles = ROW_COUNT;

    RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION app.purge_expired_platform_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired_platform_data() TO andaime_app;
