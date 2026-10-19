package pt.andaime.organization.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.organization.MemberView;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

/**
 * Gestão de memberships da organização corrente. Regras:
 * <ul>
 * <li>gerir membros exige ADMIN ou superior;</li>
 * <li>atribuir ou retirar OWNER/ADMIN exige OWNER;</li>
 * <li>a organização tem sempre pelo menos um OWNER ativo (verificado com a linha da
 * organização bloqueada, para que duas despromoções simultâneas não a deixem sem dono).</li>
 * </ul>
 */
@Service
public class MembershipService {

    static final RowMapper<MemberView> MEMBER = (resultSet, rowNumber) -> new MemberView(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("user_id", UUID.class),
            resultSet.getString("email"),
            resultSet.getString("display_name"),
            resultSet.getString("role"),
            resultSet.getString("status"),
            resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
            resultSet.getInt("version"));

    private static final String SELECT_MEMBER = """
            SELECT membership.id, membership.user_id, account.email::text AS email, account.display_name,
                   membership.role, membership.status, membership.created_at, membership.version
            FROM memberships membership
            JOIN users account ON account.id = membership.user_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;

    public MembershipService(JdbcTemplate jdbcTemplate, AuditLog auditLog) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public List<MemberView> list(UUID organizationId) {
        OrgRole.require(OrgRole.MANAGER);
        return jdbcTemplate.query(SELECT_MEMBER + """
                WHERE membership.organization_id = ?
                ORDER BY membership.status, lower(account.display_name), membership.id
                """, MEMBER, organizationId);
    }

    @Transactional
    public MemberView changeRole(UUID organizationId, UUID membershipId, OrgRole newRole, int expectedVersion) {
        var actor = OrgRole.require(OrgRole.ADMIN);
        lockOrganization(organizationId);
        var member = find(organizationId, membershipId);
        var currentRole = OrgRole.valueOf(member.role());
        if ((currentRole.isPrivileged() || newRole.isPrivileged()) && actor != OrgRole.OWNER) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden",
                    "Só um proprietário pode atribuir ou retirar os papéis de proprietário e administrador.");
        }
        if (currentRole == OrgRole.OWNER && newRole != OrgRole.OWNER) {
            ensureAnotherOwner(organizationId, membershipId);
        }
        var updated = jdbcTemplate.update("""
                UPDATE memberships SET role = ?, version = version + 1
                WHERE id = ? AND organization_id = ? AND version = ?
                """, newRole.name(), membershipId, organizationId, expectedVersion);
        if (updated == 0) {
            throw stale();
        }
        auditLog.record("membership.role-changed", "membership", membershipId,
                Map.of("role", Map.of("from", currentRole.name(), "to", newRole.name())));
        return find(organizationId, membershipId);
    }

    @Transactional
    public void deactivate(UUID organizationId, UUID membershipId) {
        var actor = OrgRole.require(OrgRole.ADMIN);
        lockOrganization(organizationId);
        var member = find(organizationId, membershipId);
        var role = OrgRole.valueOf(member.role());
        if (role.isPrivileged() && actor != OrgRole.OWNER) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden",
                    "Só um proprietário pode remover proprietários ou administradores.");
        }
        if (!"ACTIVE".equals(member.status())) {
            return;
        }
        if (role == OrgRole.OWNER) {
            ensureAnotherOwner(organizationId, membershipId);
        }
        jdbcTemplate.update("""
                UPDATE memberships SET status = 'DISABLED', version = version + 1
                WHERE id = ? AND organization_id = ?
                """, membershipId, organizationId);
        auditLog.record("membership.disabled", "membership", membershipId, Map.of("role", role.name()));
    }

    /**
     * Cria ou reativa a membership de um utilizador que aceitou um convite.
     *
     * @return o id da membership
     */
    @Transactional
    public UUID admit(UUID organizationId, UUID userId, OrgRole role) {
        var existing = jdbcTemplate.query("""
                SELECT id, status FROM memberships WHERE organization_id = ? AND user_id = ? FOR UPDATE
                """, (resultSet, rowNumber) -> new Object[] {
                resultSet.getObject("id", UUID.class), resultSet.getString("status")},
                organizationId, userId);
        if (existing.isEmpty()) {
            return jdbcTemplate.queryForObject("""
                    INSERT INTO memberships (organization_id, user_id, role) VALUES (?, ?, ?) RETURNING id
                    """, UUID.class, organizationId, userId, role.name());
        }
        var row = existing.getFirst();
        if ("ACTIVE".equals(row[1])) {
            throw new ApiException(HttpStatus.CONFLICT, "already-member", "Já é membro desta organização.");
        }
        jdbcTemplate.update("""
                UPDATE memberships SET status = 'ACTIVE', role = ?, version = version + 1 WHERE id = ?
                """, role.name(), row[0]);
        return (UUID) row[0];
    }

    boolean isActiveMember(UUID organizationId, String email) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM memberships membership
                    JOIN users account ON account.id = membership.user_id
                    WHERE membership.organization_id = ? AND account.email = ? AND membership.status = 'ACTIVE')
                """, Boolean.class, organizationId, email));
    }

    private MemberView find(UUID organizationId, UUID membershipId) {
        return jdbcTemplate.query(SELECT_MEMBER + """
                WHERE membership.organization_id = ? AND membership.id = ?
                """, MEMBER, organizationId, membershipId).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "O membro não foi encontrado."));
    }

    private void lockOrganization(UUID organizationId) {
        jdbcTemplate.query("SELECT id FROM organizations WHERE id = ? FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), organizationId);
    }

    private void ensureAnotherOwner(UUID organizationId, UUID membershipId) {
        var others = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM memberships
                WHERE organization_id = ? AND role = 'OWNER' AND status = 'ACTIVE' AND id <> ?
                """, Integer.class, organizationId, membershipId);
        if (others == null || others == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "last-owner",
                    "A organização precisa de pelo menos um proprietário ativo.");
        }
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "stale",
                "O membro foi alterado por outra pessoa. Recarregue e tente de novo.");
    }
}
