-- Mesmos papéis que infra/postgres/init/00-roles.sql: as migrações correm como andaime_owner, como em produção.
CREATE ROLE andaime_owner LOGIN PASSWORD 'andaime_owner_local' BYPASSRLS;
CREATE ROLE andaime_app LOGIN PASSWORD 'andaime_app_local' NOBYPASSRLS;
CREATE ROLE andaime_platform LOGIN PASSWORD 'andaime_platform_local' BYPASSRLS;
ALTER DATABASE andaime OWNER TO andaime_owner;
GRANT CONNECT ON DATABASE andaime TO andaime_owner, andaime_app, andaime_platform;
