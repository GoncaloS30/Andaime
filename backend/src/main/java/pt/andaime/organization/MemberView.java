package pt.andaime.organization;

import java.time.Instant;
import java.util.UUID;

public record MemberView(
        UUID id,
        UUID userId,
        String email,
        String displayName,
        String role,
        String status,
        Instant joinedAt,
        int version) {
}
