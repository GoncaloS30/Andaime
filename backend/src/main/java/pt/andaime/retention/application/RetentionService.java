package pt.andaime.retention.application;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import pt.andaime.audit.AuditLog;
import pt.andaime.notifications.Notifier;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.workforce.EmployeeRetention;

/**
 * Conservação de dados da empresa: durante quanto tempo ficam os dados pessoais de ex-trabalhadores arquivados (depois
 * são anonimizados automaticamente) e as notificações. A limpeza corre todos os dias ({@link RetentionJob}); os
 * testes chamam {@link #runFor} e {@link #purgePlatformData} diretamente.
 */
@Service
public class RetentionService {

    static final int DEFAULT_ANONYMIZE_MONTHS = 12;
    static final int DEFAULT_NOTIFICATION_MONTHS = 12;

    /** {@code anonymizeAfterMonths} nulo = anonimização automática desligada. */
    public record RetentionPolicy(Integer anonymizeAfterMonths, int notificationsAfterMonths, Instant updatedAt, int version) {
    }

    public record RetentionInput(Integer anonymizeAfterMonths, Integer notificationsAfterMonths, Integer version) {
    }

    /** Resultado da limpeza de uma empresa; {@code skipped} se outra instância já a estava a tratar. */
    public record OrganizationRun(int anonymizedEmployees, int deletedNotifications, boolean skipped) {
    }

    public record PlatformPurge(int verificationTokens, int resetTokens, int invitations, int loginThrottles) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transaction;
    private final EmployeeRetention employees;
    private final Notifier notifier;
    private final AuditLog auditLog;
    private final Clock clock;

    public RetentionService(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager, EmployeeRetention employees,
            Notifier notifier, AuditLog auditLog, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.transaction = new TransactionTemplate(transactionManager);
        this.employees = employees;
        this.notifier = notifier;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public RetentionPolicy current() {
        OrgRole.require(OrgRole.MANAGER);
        return load();
    }

    @Transactional
    public RetentionPolicy update(RetentionInput input) {
        OrgRole.require(OrgRole.ADMIN);
        validate(input);
        var before = load();
        var organizationId = TenantContext.organizationId().orElseThrow();
        var updated = jdbcTemplate.update("""
                UPDATE retention_policies SET anonymize_after_months = ?, notifications_after_months = ?, version = version + 1
                WHERE version = ?
                """, input.anonymizeAfterMonths(), input.notificationsAfterMonths(), input.version());
        if (updated == 0 && input.version() == 0) {
            // Empresa sem linha (criada fora do fluxo normal): a primeira gravação cria-a.
            updated = jdbcTemplate.update("""
                    INSERT INTO retention_policies (organization_id, anonymize_after_months, notifications_after_months, version)
                    VALUES (?, ?, ?, 1) ON CONFLICT (organization_id) DO NOTHING
                    """, organizationId, input.anonymizeAfterMonths(), input.notificationsAfterMonths());
        }
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale",
                    "A política de conservação foi alterada entretanto. Recarregue e tente de novo.");
        }
        var changes = new LinkedHashMap<String, Object>();
        diff(changes, "anonymizeAfterMonths", before.anonymizeAfterMonths(), input.anonymizeAfterMonths());
        diff(changes, "notificationsAfterMonths", before.notificationsAfterMonths(), input.notificationsAfterMonths());
        auditLog.record("retention.updated", "organization", organizationId, changes);
        return load();
    }

    /**
     * Limpeza diária de uma empresa, no contexto do seu dono (necessário para a RLS) e numa só transação: anonimiza os
     * ex-trabalhadores arquivados há mais do prazo e apaga as notificações antigas. Só uma instância trata cada
     * empresa de cada vez (lock consultivo).
     */
    public OrganizationRun runFor(UUID organizationId) {
        var owner = jdbcTemplate.query("SELECT user_id FROM app.organization_owner(?)",
                (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), organizationId).stream().findFirst().orElse(null);
        if (owner == null) {
            return new OrganizationRun(0, 0, true);
        }
        try (var ignored = TenantContext.open(organizationId, owner, "OWNER")) {
            return transaction.execute(status -> {
                var locked = jdbcTemplate.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0))", Boolean.class,
                        organizationId + ":retention");
                if (!Boolean.TRUE.equals(locked)) {
                    return new OrganizationRun(0, 0, true);
                }
                var policy = load();
                var anonymized = policy.anonymizeAfterMonths() == null ? 0
                        : employees.anonymizeArchivedBefore(OffsetDateTime.now(clock).minusMonths(policy.anonymizeAfterMonths()));
                var notifications = notifier.deleteOlderThan(policy.notificationsAfterMonths());
                return new OrganizationRun(anonymized, notifications, false);
            });
        }
    }

    /** Limpeza global (não é por empresa): tokens, convites e contadores de login antigos. */
    public PlatformPurge purgePlatformData() {
        return transaction.execute(status -> jdbcTemplate.queryForObject("SELECT * FROM app.purge_expired_platform_data()",
                (resultSet, rowNumber) -> new PlatformPurge(resultSet.getInt(1), resultSet.getInt(2), resultSet.getInt(3),
                        resultSet.getInt(4))));
    }

    private RetentionPolicy load() {
        return jdbcTemplate.query("""
                SELECT anonymize_after_months, notifications_after_months, updated_at, version FROM retention_policies
                """, (resultSet, rowNumber) -> new RetentionPolicy((Integer) resultSet.getObject(1), resultSet.getInt(2),
                resultSet.getObject(3, OffsetDateTime.class).toInstant(), resultSet.getInt(4))).stream().findFirst()
                .orElse(new RetentionPolicy(DEFAULT_ANONYMIZE_MONTHS, DEFAULT_NOTIFICATION_MONTHS, null, 0));
    }

    private static void validate(RetentionInput input) {
        if (input == null || input.version() == null) {
            throw invalid("version", "Falta a versão da política. Recarregue e tente de novo.");
        }
        if (input.anonymizeAfterMonths() != null && (input.anonymizeAfterMonths() < 1 || input.anonymizeAfterMonths() > 120)) {
            throw invalid("anonymizeAfterMonths", "A anonimização automática tem de ser entre 1 e 120 meses (ou desligada).");
        }
        if (input.notificationsAfterMonths() == null || input.notificationsAfterMonths() < 1 || input.notificationsAfterMonths() > 60) {
            throw invalid("notificationsAfterMonths", "As notificações ficam entre 1 e 60 meses.");
        }
    }

    private static void diff(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            var change = new LinkedHashMap<String, Object>();
            change.put("from", before);
            change.put("to", after);
            changes.put(field, change);
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }
}
