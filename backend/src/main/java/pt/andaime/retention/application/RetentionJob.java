package pt.andaime.retention.application;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Conservação de dados, todas as noites: primeiro a limpeza global (tokens, convites, contadores de login), depois
 * empresa a empresa, cada uma na sua transação com RLS. Uma falha numa empresa não impede as outras.
 */
@Component
@ConditionalOnProperty(name = "andaime.jobs.enabled", havingValue = "true", matchIfMissing = true)
class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);

    private final JdbcTemplate jdbcTemplate;
    private final RetentionService retention;

    RetentionJob(JdbcTemplate jdbcTemplate, RetentionService retention) {
        this.jdbcTemplate = jdbcTemplate;
        this.retention = retention;
    }

    @Scheduled(cron = "${andaime.jobs.retention-cron:0 30 3 * * *}", zone = "Europe/Lisbon")
    void run() {
        try {
            var purged = retention.purgePlatformData();
            log.info("Conservação de dados (global): {} tokens de verificação, {} de recuperação, {} convites, {} bloqueios de login",
                    purged.verificationTokens(), purged.resetTokens(), purged.invitations(), purged.loginThrottles());
        } catch (RuntimeException exception) {
            log.warn("Conservação de dados (global) falhou", exception);
        }
        for (var organizationId : jdbcTemplate.queryForList("SELECT * FROM app.active_org_ids()", UUID.class)) {
            try {
                var result = retention.runFor(organizationId);
                if (result.anonymizedEmployees() > 0 || result.deletedNotifications() > 0) {
                    log.info("Conservação de dados: {} trabalhadores anonimizados e {} notificações apagadas na empresa {}",
                            result.anonymizedEmployees(), result.deletedNotifications(), organizationId);
                }
            } catch (RuntimeException exception) {
                log.warn("Conservação de dados falhou na empresa {}", organizationId, exception);
            }
        }
    }
}
