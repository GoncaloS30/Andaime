\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'andaime_owner') THEN
        CREATE ROLE andaime_owner LOGIN PASSWORD 'andaime_owner_local' BYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'andaime_app') THEN
        CREATE ROLE andaime_app LOGIN PASSWORD 'andaime_app_local' NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'andaime_platform') THEN
        CREATE ROLE andaime_platform LOGIN PASSWORD 'andaime_platform_local' BYPASSRLS;
    END IF;
END
$$;

ALTER DATABASE andaime OWNER TO andaime_owner;
GRANT CONNECT ON DATABASE andaime TO andaime_app, andaime_platform;
