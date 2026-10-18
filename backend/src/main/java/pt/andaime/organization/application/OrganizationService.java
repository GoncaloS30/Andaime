package pt.andaime.organization.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.organization.OrganizationView;

@Service
public class OrganizationService {

    private static final List<String> DEFAULT_CONFLICT_RULES = List.of(
            "EMPLOYEE_OVERLAP",
            "VEHICLE_OVERLAP",
            "ABSENCE",
            "UNAVAILABLE",
            "DAILY_CAPACITY",
            "TEAM_MISMATCH",
            "VEHICLE_CAPACITY",
            "MISSING_FOREMAN",
            "MULTIPLE_SITES_DAY");

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public OrganizationService(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional
    public OrganizationView create(
            UUID organizationId,
            UUID userId,
            String name,
            String legalName,
            String taxId,
            String country,
            String timezone) {
        jdbcTemplate.update("""
                INSERT INTO organizations
                    (id, name, legal_name, tax_id, country, default_timezone, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, organizationId, name.strip(), blankToNull(legalName), blankToNull(taxId),
                country, timezone, userId);
        jdbcTemplate.update("""
                INSERT INTO memberships (organization_id, user_id, role)
                VALUES (?, ?, 'OWNER')
                """, organizationId, userId);
        jdbcTemplate.update("""
                INSERT INTO labor_policies (
                    organization_id, country, effective_during,
                    daily_normal_min, weekly_normal_min,
                    auto_break_after_min, auto_break_min)
                VALUES (?, NULL, daterange(?, NULL, '[)'), 480, 2400, 360, 60)
                """, organizationId, LocalDate.now(clock));
        DEFAULT_CONFLICT_RULES.forEach(rule -> jdbcTemplate.update("""
                INSERT INTO conflict_rule_settings (organization_id, rule, severity)
                VALUES (?, ?, ?)
                """, organizationId, rule, defaultSeverity(rule)));
        jdbcTemplate.update("""
                UPDATE users SET last_active_org_id = ?, version = version + 1 WHERE id = ?
                """, organizationId, userId);
        jdbcTemplate.update("""
                INSERT INTO audit_event
                    (organization_id, actor_user_id, actor_role, action, entity_type, entity_id)
                VALUES (?, ?, 'OWNER', 'organization.created', 'organization', ?)
                """, organizationId, userId, organizationId);

        return new OrganizationView(organizationId, name.strip(), blankToNull(legalName),
                blankToNull(taxId), country, timezone, "EUR", "ACTIVE", 0);
    }

    private String defaultSeverity(String rule) {
        return switch (rule) {
            case "EMPLOYEE_OVERLAP", "VEHICLE_OVERLAP", "ABSENCE", "UNAVAILABLE" -> "BLOCK";
            default -> "WARN";
        };
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
