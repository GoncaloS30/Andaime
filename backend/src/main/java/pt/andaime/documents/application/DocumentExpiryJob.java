package pt.andaime.documents.application;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pt.andaime.shared.tenant.TenantContext;

/**
 * Alertas diários de validade. Percorre as empresas ativas, cada uma na sua transação com RLS, e só uma instância
 * trata cada empresa de cada vez (lock consultivo). As notificações são deduplicadas por versão e situação, por isso
 * correr duas vezes no mesmo dia não repete avisos.
 */
@Component
@ConditionalOnProperty(name = "andaime.jobs.enabled", havingValue = "true", matchIfMissing = true)
class DocumentExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(DocumentExpiryJob.class);

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transaction;
    private final DocumentService documents;

    DocumentExpiryJob(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager, DocumentService documents) {
        this.jdbcTemplate = jdbcTemplate;
        this.transaction = new TransactionTemplate(transactionManager);
        this.documents = documents;
    }

    @Scheduled(cron = "${andaime.jobs.document-expiry-cron:0 0 6 * * *}", zone = "Europe/Lisbon")
    void run() {
        for (var organizationId : jdbcTemplate.queryForList("SELECT * FROM app.active_org_ids()", UUID.class)) {
            try {
                var created = runFor(organizationId);
                if (created > 0) {
                    log.info("Alertas de validade: {} notificações na empresa {}", created, organizationId);
                }
            } catch (RuntimeException exception) {
                log.warn("Alertas de validade falharam na empresa {}", organizationId, exception);
            }
        }
    }

    /** Executa para uma empresa, no contexto do seu dono (necessário para a RLS; nada é auditado em nome dele). */
    int runFor(UUID organizationId) {
        var owner = jdbcTemplate.query("""
                SELECT user_id FROM app.organization_owner(?)
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), organizationId).stream().findFirst().orElse(null);
        if (owner == null) {
            return 0;
        }
        try (var ignored = TenantContext.open(organizationId, owner, "OWNER")) {
            return transaction.execute(status -> {
                var locked = jdbcTemplate.queryForObject("SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0))", Boolean.class,
                        organizationId + ":document-expiry");
                return Boolean.TRUE.equals(locked) ? documents.notifyExpiring() : 0;
            });
        }
    }
}
