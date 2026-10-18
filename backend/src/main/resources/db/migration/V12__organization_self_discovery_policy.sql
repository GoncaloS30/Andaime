DROP POLICY organizations_tenant_policy ON organizations;

CREATE POLICY organizations_select_policy ON organizations
    FOR SELECT
    USING (
        id = app.current_org_id()
        OR EXISTS (
            SELECT 1
            FROM memberships membership
            WHERE membership.organization_id = organizations.id
              AND membership.user_id = app.current_user_id()
              AND membership.status = 'ACTIVE'
        )
    );

CREATE POLICY organizations_write_policy ON organizations
    FOR ALL
    USING (id = app.current_org_id())
    WITH CHECK (id = app.current_org_id());
