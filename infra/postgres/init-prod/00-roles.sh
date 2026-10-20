#!/bin/sh
# Papéis da base de dados do Andaime em produção (PostgreSQL em contentor, compose.prod.yaml).
# Corre uma única vez, quando o volume de dados está vazio (docker-entrypoint-initdb.d), como superutilizador.
# As palavras-passe vêm do ambiente do contentor (.env.prod); nunca ficam no repositório.
#
#   andaime_owner    dono do esquema; só o Flyway liga com ele (migrações no arranque do backend)
#   andaime_app      pool da aplicação: só DML, sempre sujeito a RLS (NOBYPASSRLS)
#   andaime_platform administração da plataforma: leitura entre empresas e estado das organizações
#
# Em PostgreSQL gerido, executar os mesmos comandos à mão (ver docs/operacao/deploy.md).
set -eu

: "${ANDAIME_DATABASE_OWNER_PASSWORD:?falta ANDAIME_DATABASE_OWNER_PASSWORD}"
: "${ANDAIME_DATABASE_PASSWORD:?falta ANDAIME_DATABASE_PASSWORD}"
: "${ANDAIME_PLATFORM_DATABASE_PASSWORD:?falta ANDAIME_PLATFORM_DATABASE_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v owner_password="$ANDAIME_DATABASE_OWNER_PASSWORD" \
    -v app_password="$ANDAIME_DATABASE_PASSWORD" \
    -v platform_password="$ANDAIME_PLATFORM_DATABASE_PASSWORD" \
    -v database="$POSTGRES_DB" <<'SQL'
CREATE ROLE andaime_owner LOGIN PASSWORD :'owner_password' BYPASSRLS;
CREATE ROLE andaime_app LOGIN PASSWORD :'app_password' NOBYPASSRLS;
CREATE ROLE andaime_platform LOGIN PASSWORD :'platform_password' BYPASSRLS;

ALTER DATABASE :"database" OWNER TO andaime_owner;
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database" TO andaime_app, andaime_platform;
SQL
