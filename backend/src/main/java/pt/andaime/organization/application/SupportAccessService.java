package pt.andaime.organization.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Acesso de suporte: o dono ou um administrador da empresa autoriza um administrador da plataforma a ver os dados
 * da empresa durante algumas horas, com motivo. O acesso é só de leitura, revogável a qualquer momento e cada
 * pedido feito com ele fica na auditoria da empresa.
 */
@Service
public class SupportAccessService {

    static final int MAX_HOURS = 72;

    public record GrantView(UUID id, String platformUserEmail, String platformUserName, String grantedBy, String reason,
            Instant createdAt, Instant expiresAt, Instant revokedAt, boolean active, long requests) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final Clock clock;

    public SupportAccessService(JdbcTemplate jdbcTemplate, AuditLog auditLog, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<GrantView> list() {
        OrgRole.require(OrgRole.ADMIN);
        return jdbcTemplate.query("""
                SELECT grant_row.id, support.email::text, support.display_name, granter.display_name, grant_row.reason,
                       grant_row.created_at, grant_row.expires_at, grant_row.revoked_at,
                       (SELECT count(*) FROM audit_event event WHERE event.entity_type = 'support_access_grant'
                         AND event.entity_id = grant_row.id AND event.action = 'support.viewed') AS requests
                FROM support_access_grants grant_row
                JOIN users support ON support.id = grant_row.platform_user_id
                JOIN users granter ON granter.id = grant_row.granted_by_user_id
                ORDER BY grant_row.created_at DESC LIMIT 50
                """, (resultSet, rowNumber) -> {
            var expires = resultSet.getObject(7, OffsetDateTime.class).toInstant();
            var revoked = resultSet.getObject(8, OffsetDateTime.class);
            return new GrantView(resultSet.getObject(1, UUID.class), resultSet.getString(2), resultSet.getString(3),
                    resultSet.getString(4), resultSet.getString(5), resultSet.getObject(6, OffsetDateTime.class).toInstant(), expires,
                    revoked == null ? null : revoked.toInstant(), revoked == null && expires.isAfter(clock.instant()),
                    resultSet.getLong(9));
        });
    }

    @Transactional
    public GrantView grant(String email, int hours, String reason) {
        OrgRole.require(OrgRole.ADMIN);
        if (hours < 1 || hours > MAX_HOURS) {
            throw invalid("hours", "O acesso dura entre 1 e " + MAX_HOURS + " horas.");
        }
        if (reason == null || reason.strip().length() < 10 || reason.length() > 500) {
            throw invalid("reason", "Descreva o motivo (pelo menos 10 caracteres).");
        }
        var normalized = email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
        var supportUser = jdbcTemplate.query("""
                SELECT person.id FROM users person JOIN platform_admins admin ON admin.user_id = person.id WHERE person.email = ?
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), normalized).stream().findFirst()
                .orElseThrow(() -> invalid("email", "Esse email não pertence à equipa de suporte do Andaime."));
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO support_access_grants (organization_id, platform_user_id, granted_by_user_id, reason, expires_at)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), supportUser, TenantContext.userId().orElseThrow(),
                reason.strip(), java.sql.Timestamp.from(clock.instant().plus(Duration.ofHours(hours))));
        auditLog.record("support.granted", "support_access_grant", id, Map.of("email", normalized, "hours", hours,
                "reason", reason.strip()));
        return list().stream().filter(g -> g.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public GrantView revoke(UUID id) {
        OrgRole.require(OrgRole.ADMIN);
        if (jdbcTemplate.update("UPDATE support_access_grants SET revoked_at = now() WHERE id = ? AND revoked_at IS NULL", id) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O acesso não existe ou já foi revogado.");
        }
        auditLog.record("support.revoked", "support_access_grant", id);
        return list().stream().filter(g -> g.id().equals(id)).findFirst().orElseThrow();
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }
}
