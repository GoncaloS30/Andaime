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
        int version) {
}
