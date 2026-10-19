package pt.andaime.organization.application;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.organization.InvitationView;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.security.Tokens;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

@Service
public class InvitationService {

    private static final Duration VALIDITY = Duration.ofDays(7);

    private final JdbcTemplate jdbcTemplate;
    private final MembershipService membershipService;
    private final OrganizationMailGateway mailGateway;
    private final AuditLog auditLog;
    private final Clock clock;

    public InvitationService(
            JdbcTemplate jdbcTemplate,
            MembershipService membershipService,
            OrganizationMailGateway mailGateway,
            AuditLog auditLog,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.membershipService = membershipService;
        this.mailGateway = mailGateway;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<InvitationView> listPending(UUID organizationId) {
        OrgRole.require(OrgRole.ADMIN);
        var now = now();
        return jdbcTemplate.query("""
                SELECT invitation.id, invitation.email::text AS email, invitation.role,
                       inviter.display_name, invitation.created_at, invitation.expires_at
                FROM invitations invitation
                JOIN users inviter ON inviter.id = invitation.invited_by_user_id
                WHERE invitation.organization_id = ?
                  AND invitation.accepted_at IS NULL AND invitation.revoked_at IS NULL
                ORDER BY invitation.created_at DESC
                """, (resultSet, rowNumber) -> {
            var expiresAt = resultSet.getObject("expires_at", OffsetDateTime.class);
            return new InvitationView(
                    resultSet.getObject("id", UUID.class),
                    resultSet.getString("email"),
                    resultSet.getString("role"),
                    resultSet.getString("display_name"),
                    resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                    expiresAt.toInstant(),
                    !expiresAt.isAfter(now));
        }, organizationId);
    }

    @Transactional
    public UUID invite(UUID organizationId, String rawEmail, OrgRole role) {
        var actor = OrgRole.require(OrgRole.ADMIN);
        if (role == OrgRole.OWNER || (role == OrgRole.ADMIN && actor != OrgRole.OWNER)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden",
                    role == OrgRole.OWNER
                            ? "Não é possível convidar proprietários. Convide como administrador e promova depois."
                            : "Só um proprietário pode convidar administradores.");
        }
        var email = rawEmail.strip().toLowerCase(Locale.ROOT);
        if (membershipService.isActiveMember(organizationId, email)) {
            throw new ApiException(HttpStatus.CONFLICT, "already-member", "Esta pessoa já é membro da organização.");
        }
        // Um convite novo substitui o pendente para o mesmo email.
        jdbcTemplate.update("""
                UPDATE invitations SET revoked_at = now(), version = version + 1
                WHERE organization_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL
                """, organizationId, email);
        var token = Tokens.newToken();
        var invitationId = jdbcTemplate.queryForObject("""
                INSERT INTO invitations (organization_id, email, role, token_hash, expires_at, invited_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, organizationId, email, role.name(), Tokens.sha256(token),
                now().plus(VALIDITY), currentUser());
        sendMail(organizationId, email, role.name(), token);
        auditLog.record("invitation.created", "invitation", invitationId, Map.of("role", role.name()));
        return invitationId;
    }

    @Transactional
    public void revoke(UUID organizationId, UUID invitationId) {
        OrgRole.require(OrgRole.ADMIN);
        var updated = jdbcTemplate.update("""
                UPDATE invitations SET revoked_at = now(), version = version + 1
                WHERE id = ? AND organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
                """, invitationId, organizationId);
        if (updated == 0) {
            throw notFound();
        }
        auditLog.record("invitation.revoked", "invitation", invitationId);
    }

    @Transactional
    public void resend(UUID organizationId, UUID invitationId) {
        OrgRole.require(OrgRole.ADMIN);
        var token = Tokens.newToken();
        var rows = jdbcTemplate.query("""
                UPDATE invitations SET token_hash = ?, expires_at = ?, version = version + 1
                WHERE id = ? AND organization_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
                RETURNING email::text AS email, role
                """, (resultSet, rowNumber) -> new String[] {resultSet.getString("email"), resultSet.getString("role")},
                Tokens.sha256(token), now().plus(VALIDITY), invitationId, organizationId);
        if (rows.isEmpty()) {
            throw notFound();
        }
        sendMail(organizationId, rows.getFirst()[0], rows.getFirst()[1], token);
        auditLog.record("invitation.resent", "invitation", invitationId);
    }

    @Transactional(readOnly = true)
    public InvitationView.Preview preview(String token) {
        var invitation = lookup(token);
        return new InvitationView.Preview(
                invitation.organizationName(),
                invitation.role(),
                mask(invitation.email()),
                invitation.expiresAt().toInstant(),
                invitation.status(now()));
    }

    /** Aceita um convite. O email da sessão tem de coincidir com o email convidado. */
    @Transactional
    public InvitationView.Accepted accept(String token, UUID userId, String userEmail) {
        var invitation = lookup(token);
        var status = invitation.status(now());
        if (!"VALID".equals(status)) {
            throw new ApiException(HttpStatus.CONFLICT, "invitation-invalid", switch (status) {
                case "EXPIRED" -> "O convite expirou. Peça um novo convite.";
                case "ACCEPTED" -> "O convite já foi aceite.";
                case "SUSPENDED" -> "A organização está suspensa.";
                default -> "O convite foi cancelado.";
            });
        }
        if (!invitation.email().equalsIgnoreCase(userEmail)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "invitation-email-mismatch",
                    "Este convite foi enviado para outro email. Entre com a conta " + mask(invitation.email()) + ".");
        }
        var role = OrgRole.valueOf(invitation.role());
        try (var ignored = TenantContext.open(invitation.organizationId(), userId, role.name())) {
            setTenant(invitation.organizationId(), userId);
            // Bloqueia o convite para que duas aceitações simultâneas não criem duas memberships.
            var locked = jdbcTemplate.query("""
                    SELECT id FROM invitations
                    WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE
                    """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), invitation.id());
            if (locked.isEmpty()) {
                throw new ApiException(HttpStatus.CONFLICT, "invitation-invalid", "O convite já foi usado.");
            }
            var membershipId = membershipService.admit(invitation.organizationId(), userId, role);
            jdbcTemplate.update("""
                    UPDATE invitations SET accepted_at = now(), version = version + 1 WHERE id = ?
                    """, invitation.id());
            jdbcTemplate.update("""
                    UPDATE users SET last_active_org_id = ?, version = version + 1 WHERE id = ?
                    """, invitation.organizationId(), userId);
            auditLog.record("invitation.accepted", "membership", membershipId, Map.of("role", role.name()));
        }
        return new InvitationView.Accepted(invitation.organizationId(), invitation.organizationName(), role.name());
    }

    private Lookup lookup(String token) {
        return jdbcTemplate.query("SELECT * FROM app.invitation_by_token_hash(?)",
                (resultSet, rowNumber) -> new Lookup(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getObject("organization_id", UUID.class),
                        resultSet.getString("organization_name"),
                        resultSet.getString("organization_status"),
                        resultSet.getString("email"),
                        resultSet.getString("role"),
                        resultSet.getObject("expires_at", OffsetDateTime.class),
                        resultSet.getObject("accepted_at", OffsetDateTime.class),
                        resultSet.getObject("revoked_at", OffsetDateTime.class)),
                (Object) Tokens.sha256(token)).stream().findFirst()
                .orElseThrow(InvitationService::notFound);
    }

    /** A transação já começou sem organização; define-a agora, localmente à transação. */
    private void setTenant(UUID organizationId, UUID userId) {
        jdbcTemplate.queryForObject(
                "SELECT set_config('app.org_id', ?, true), set_config('app.user_id', ?, true)",
                (resultSet, rowNumber) -> null, organizationId.toString(), userId.toString());
    }

    private void sendMail(UUID organizationId, String email, String role, String token) {
        var names = jdbcTemplate.queryForObject("""
                SELECT organization.name, inviter.display_name
                FROM organizations organization, users inviter
                WHERE organization.id = ? AND inviter.id = ?
                """, (resultSet, rowNumber) -> new String[] {resultSet.getString(1), resultSet.getString(2)},
                organizationId, currentUser());
        mailGateway.sendInvitation(email, names[0], names[1], role, token);
    }

    private UUID currentUser() {
        return TenantContext.userId().orElseThrow();
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    static String mask(String email) {
        var at = email.indexOf('@');
        if (at <= 1) {
            return "***" + email.substring(Math.max(at, 0));
        }
        return email.charAt(0) + "***" + email.substring(at);
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O convite não foi encontrado.");
    }

    private record Lookup(
            UUID id,
            UUID organizationId,
            String organizationName,
            String organizationStatus,
            String email,
            String role,
            OffsetDateTime expiresAt,
            OffsetDateTime acceptedAt,
            OffsetDateTime revokedAt) {

        String status(OffsetDateTime now) {
            if (acceptedAt != null) {
                return "ACCEPTED";
            }
            if (revokedAt != null) {
                return "REVOKED";
            }
            if (!"ACTIVE".equals(organizationStatus)) {
                return "SUSPENDED";
            }
            return expiresAt.isAfter(now) ? "VALID" : "EXPIRED";
        }
    }
}
