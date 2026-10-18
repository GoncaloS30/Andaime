package pt.andaime.identity.application;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.identity.MeView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.shared.api.ApiException;

@Service
public class MeService {

    private final JdbcTemplate jdbcTemplate;

    public MeService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public MeView load(UserPrincipal principal) {
        var user = jdbcTemplate.queryForObject("""
                SELECT id, email::text, display_name, locale, last_active_org_id
                FROM users WHERE id = ?
                """, (resultSet, rowNumber) -> new UserRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("email"),
                resultSet.getString("display_name"),
                resultSet.getString("locale"),
                resultSet.getObject("last_active_org_id", UUID.class)), principal.id());

        var memberships = jdbcTemplate.query("""
                SELECT membership.id, membership.organization_id, organization.name, membership.role
                FROM memberships membership
                JOIN organizations organization ON organization.id = membership.organization_id
                WHERE membership.user_id = ? AND membership.status = 'ACTIVE'
                ORDER BY lower(organization.name), membership.id
                """, (resultSet, rowNumber) -> new MeView.MembershipView(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("organization_id", UUID.class),
                resultSet.getString("name"),
                resultSet.getString("role")), principal.id());

        var platformAdmin = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = ?)",
                Boolean.class,
                principal.id()));

        return new MeView(
                new MeView.UserView(user.id(), user.email(), user.displayName(), user.locale()),
                memberships,
                user.lastActiveOrgId(),
                platformAdmin);
    }

    @Transactional
    public MeView updateProfile(UserPrincipal principal, String displayName, String locale) {
        jdbcTemplate.update("""
                UPDATE users
                SET display_name = ?, locale = ?, version = version + 1
                WHERE id = ?
                """, displayName.strip(), locale, principal.id());
        return load(principal);
    }

    @Transactional
    public void selectActiveOrganization(UserPrincipal principal, UUID organizationId) {
        var allowed = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM memberships membership
                    JOIN organizations organization ON organization.id = membership.organization_id
                    WHERE membership.user_id = ?
                      AND membership.organization_id = ?
                      AND membership.status = 'ACTIVE'
                      AND organization.status = 'ACTIVE'
                )
                """, Boolean.class, principal.id(), organizationId));
        if (!allowed) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "A organização não foi encontrada.");
        }
        jdbcTemplate.update("""
                UPDATE users SET last_active_org_id = ?, version = version + 1 WHERE id = ?
                """, organizationId, principal.id());
    }

    private record UserRow(
            UUID id,
            String email,
            String displayName,
            String locale,
            UUID lastActiveOrgId) {
    }
}
