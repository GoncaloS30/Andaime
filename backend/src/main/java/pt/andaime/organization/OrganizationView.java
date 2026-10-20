package pt.andaime.organization;

import java.util.UUID;

public record OrganizationView(
        UUID id,
        String name,
        String legalName,
        String taxId,
        String country,
        String timezone,
        String currency,
        String status,
        /** OWNER/ADMIN devem ter a verificação em dois passos ativa (aviso no frontend). */
        boolean requireAdmin2fa,
        int version) {
}
