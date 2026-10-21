-- F8.5: diário de obra. Registos por obra e dia (vários no mesmo dia), com até 20 fotos cada no armazenamento S3
-- privado (o mesmo das fotografias da V22, com o mesmo antivírus). Pesquisa sem acentos nem maiúsculas no título e
-- no texto com app.fold_name (V28) e um índice de trigramas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE diary_entries (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    site_id uuid NOT NULL,
    entry_date date NOT NULL,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
    body text NOT NULL DEFAULT '' CHECK (length(body) <= 10000),
    author_user_id uuid NOT NULL REFERENCES users (id),
    -- Papel na empresa quando escreveu (o texto do registo diz "Direção de obra" ou "Encarregado").
    author_role text NOT NULL CHECK (author_role IN ('OWNER', 'ADMIN', 'MANAGER', 'FOREMAN')),
    -- Chave do cliente (telemóvel) para repetir o envio sem duplicar o registo.
    client_key uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT diary_entries_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT diary_entries_site_fk FOREIGN KEY (organization_id, site_id) REFERENCES sites (organization_id, id)
);
CREATE UNIQUE INDEX diary_entries_client_key_uk ON diary_entries (organization_id, author_user_id, client_key)
    WHERE client_key IS NOT NULL;
-- Linha do tempo de uma obra (do mais recente para o mais antigo) e atalhos por mês.
CREATE INDEX diary_entries_site_date_idx ON diary_entries (organization_id, site_id, entry_date DESC, created_at DESC);
-- Últimos registos de todas as obras (início do gestor).
CREATE INDEX diary_entries_recent_idx ON diary_entries (organization_id, created_at DESC);
-- Pesquisa "betao" encontra "Betão": a mesma expressão é usada na consulta (LIKE '%…%').
CREATE INDEX diary_entries_search_idx ON diary_entries USING gin (app.fold_name(title || ' ' || body) gin_trgm_ops);

CREATE TRIGGER diary_entries_touch_updated_at BEFORE UPDATE ON diary_entries
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE diary_photos (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    organization_id uuid NOT NULL,
    entry_id uuid NOT NULL,
    -- 0..19: no máximo 20 fotos por registo.
    position integer NOT NULL CHECK (position BETWEEN 0 AND 19),
    storage_key text NOT NULL,
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    width integer CHECK (width > 0),
    height integer CHECK (height > 0),
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    scan_status text NOT NULL DEFAULT 'NOT_SCANNED' CHECK (scan_status IN ('NOT_SCANNED', 'CLEAN')),
    client_key uuid,
    uploaded_by_user_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT diary_photos_org_id_uk UNIQUE (organization_id, id),
    CONSTRAINT diary_photos_storage_key_uk UNIQUE (storage_key),
    CONSTRAINT diary_photos_entry_fk FOREIGN KEY (organization_id, entry_id)
        REFERENCES diary_entries (organization_id, id) ON DELETE CASCADE,
    -- Verificada no fim de cada instrução: remover uma foto renumera as seguintes numa só instrução.
    CONSTRAINT diary_photos_position_uk UNIQUE (organization_id, entry_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE UNIQUE INDEX diary_photos_client_key_uk ON diary_photos (organization_id, entry_id, client_key)
    WHERE client_key IS NOT NULL;

ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY diary_entries_tenant_policy ON diary_entries
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());
ALTER TABLE diary_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY diary_photos_tenant_policy ON diary_photos
    USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON diary_entries, diary_photos TO andaime_app;
