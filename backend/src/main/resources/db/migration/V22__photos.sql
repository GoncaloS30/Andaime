-- Fotografias de trabalhadores e obras no armazenamento privado (S3). Só se guarda a chave e o tipo; a imagem é
-- servida pela API depois de verificar o acesso, com a data de alteração no URL para cache.

ALTER TABLE employees
    ADD COLUMN photo_key text,
    ADD COLUMN photo_content_type text,
    ADD COLUMN photo_updated_at timestamptz,
    ADD CONSTRAINT employees_photo_ck CHECK ((photo_key IS NULL) = (photo_content_type IS NULL)
        AND (photo_key IS NULL) = (photo_updated_at IS NULL));

ALTER TABLE sites
    ADD COLUMN photo_key text,
    ADD COLUMN photo_content_type text,
    ADD COLUMN photo_updated_at timestamptz,
    ADD CONSTRAINT sites_photo_ck CHECK ((photo_key IS NULL) = (photo_content_type IS NULL)
        AND (photo_key IS NULL) = (photo_updated_at IS NULL));
