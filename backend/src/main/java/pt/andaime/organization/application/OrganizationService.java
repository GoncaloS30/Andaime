package pt.andaime.organization.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.organization.OrganizationView;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

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
            "MULTIPLE_SITES_DAY",
            "VEHICLE_UNAVAILABLE",
            "SITE_HOUR_LIMIT");

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;
    private final AuditLog auditLog;

    public OrganizationService(JdbcTemplate jdbcTemplate, Clock clock, AuditLog auditLog) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
        this.auditLog = auditLog;
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

    @Transactional(readOnly = true)
    public OrganizationView get(UUID organizationId) {
        return jdbcTemplate.query("""
                SELECT id, name, legal_name, tax_id, country, default_timezone, currency, status, version
                FROM organizations WHERE id = ?
                """, (resultSet, rowNumber) -> new OrganizationView(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("name"),
                resultSet.getString("legal_name"),
                resultSet.getString("tax_id"),
                resultSet.getString("country"),
                resultSet.getString("default_timezone"),
                resultSet.getString("currency"),
                resultSet.getString("status"),
                resultSet.getInt("version")), organizationId).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A organização não foi encontrada."));
    }

    @Transactional
    public OrganizationView update(
            UUID organizationId,
            String name,
            String legalName,
            String taxId,
            String timezone,
            int expectedVersion) {
        OrgRole.require(OrgRole.ADMIN);
        var before = get(organizationId);
        var updated = jdbcTemplate.update("""
                UPDATE organizations
                SET name = ?, legal_name = ?, tax_id = ?, default_timezone = ?, version = version + 1
                WHERE id = ? AND version = ?
                """, name.strip(), blankToNull(legalName), blankToNull(taxId), timezone,
                organizationId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale",
                    "A organização foi alterada por outra pessoa. Recarregue e tente de novo.");
        }
        var after = get(organizationId);
        auditLog.record("organization.updated", "organization", organizationId, changes(before, after));
        return after;
    }

    private Map<String, Object> changes(OrganizationView before, OrganizationView after) {
        var changes = new LinkedHashMap<String, Object>();
        diff(changes, "name", before.name(), after.name());
        diff(changes, "legalName", before.legalName(), after.legalName());
        diff(changes, "taxId", before.taxId(), after.taxId());
        diff(changes, "timezone", before.timezone(), after.timezone());
        return changes;
    }

    private static void diff(Map<String, Object> changes, String field, String before, String after) {
        if (!Objects.equals(before, after)) {
            var change = new LinkedHashMap<String, Object>();
            change.put("from", before);
            change.put("to", after);
            changes.put(field, change);
        }
    }

    private String defaultSeverity(String rule) {
        return switch (rule) {
            case "EMPLOYEE_OVERLAP", "VEHICLE_OVERLAP", "ABSENCE", "UNAVAILABLE", "VEHICLE_UNAVAILABLE" -> "BLOCK";
            default -> "WARN";
        };
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
