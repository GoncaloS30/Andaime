package pt.andaime.identity;

import java.time.Instant;

public record SessionView(
        String id,
        Instant createdAt,
        Instant lastAccessedAt,
        Instant expiresAt,
        boolean current) {
}
