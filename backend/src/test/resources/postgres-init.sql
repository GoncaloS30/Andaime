CREATE ROLE andaime_owner LOGIN PASSWORD 'andaime_owner_local' BYPASSRLS;
CREATE ROLE andaime_app LOGIN PASSWORD 'andaime_app_local' NOBYPASSRLS;
CREATE ROLE andaime_platform LOGIN PASSWORD 'andaime_platform_local' BYPASSRLS;
GRANT CONNECT ON DATABASE andaime TO andaime_owner, andaime_app, andaime_platform;
