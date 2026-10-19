package pt.andaime.organization;

import java.time.Instant;
import java.util.UUID;

public record InvitationView(
        UUID id,
        String email,
        String role,
        String invitedBy,
        Instant createdAt,
        Instant expiresAt,
        boolean expired) {

    /** Vista pública de um convite, antes de existir sessão ou membership. */
    public record Preview(
            String organizationName,
            String role,
            String emailMasked,
            Instant expiresAt,
            String status) {
    }

    public record Accepted(UUID orgId, String orgName, String role) {
    }
}
