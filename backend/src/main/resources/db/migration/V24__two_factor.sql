-- Verificação em dois passos (TOTP, RFC 6238).
-- Tabelas globais, como users: sem RLS, acedidas sempre pelo id do próprio utilizador
-- (o serviço de identidade nunca as consulta por outro critério).

CREATE TABLE user_totp (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Segredo cifrado com AES-256-GCM (nonce de 12 bytes || texto cifrado com etiqueta),
    -- com o id do utilizador como dados associados. A chave vem de andaime.security.totp-key.
    secret_ciphertext bytea NOT NULL,
    -- NULL = configuração iniciada mas ainda não confirmada com um código.
    enabled_at timestamptz,
    -- Último passo de 30 s aceite: impede reutilizar o mesmo código (ou um mais antigo).
    last_used_step bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_totp_touch_updated_at
BEFORE UPDATE ON user_totp
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Códigos de recuperação de uso único: só o hash (SHA-256 com sal próprio por código).
CREATE TABLE user_recovery_codes (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    salt bytea NOT NULL,
    code_hash bytea NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_recovery_codes_user_idx
    ON user_recovery_codes (user_id)
    WHERE used_at IS NULL;

-- Política da empresa: OWNER/ADMIN devem ter a verificação em dois passos ativa.
ALTER TABLE organizations
    ADD COLUMN require_admin_2fa boolean NOT NULL DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_totp, user_recovery_codes TO andaime_app;
-- A administração da plataforma não precisa de segredos de autenticação (os privilégios
-- por omissão de V11 dar-lhe-iam leitura).
REVOKE ALL ON user_totp, user_recovery_codes FROM andaime_platform;
