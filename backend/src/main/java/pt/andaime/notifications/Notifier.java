package pt.andaime.notifications;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import pt.andaime.notifications.application.NotificationStream;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Contrato público do módulo de notificações. As notificações são gravadas na mesma transação da alteração que as
 * origina (se a alteração falhar, não há notificação) e só são empurradas por SSE depois do commit.
 */
@Component
public class Notifier {

    private final JdbcTemplate jdbcTemplate;
    private final NotificationStream stream;

    public Notifier(JdbcTemplate jdbcTemplate, NotificationStream stream) {
        this.jdbcTemplate = jdbcTemplate;
        this.stream = stream;
    }

    /**
     * @param dedupeKey se não for nulo, a mesma notificação não é criada duas vezes para o mesmo utilizador
     *                  (ex.: alerta diário de validade)
     */
    public void notify(Collection<UUID> userIds, String kind, String title, String body, String link, String dedupeKey) {
        var organizationId = TenantContext.organizationId().orElseThrow();
        var actor = TenantContext.userId().orElse(null);
        for (var userId : userIds) {
            if (userId == null || userId.equals(actor) && dedupeKey == null) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO notifications (organization_id, user_id, kind, title, body, link, dedupe_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
                    """, organizationId, userId, kind, title, body, link, dedupeKey);
        }
        var recipients = List.copyOf(userIds);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    stream.changed(organizationId, recipients);
                }
            });
        } else {
            stream.changed(organizationId, recipients);
        }
    }

    /** Gestores ativos (dono, administrador e gestor) da empresa corrente. */
    public List<UUID> managers() {
        return jdbcTemplate.queryForList("""
                SELECT user_id FROM memberships WHERE status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN', 'MANAGER')
                """, UUID.class);
    }

    /** Conta ligada à ficha de um trabalhador, se existir. */
    public List<UUID> userOfEmployee(UUID employeeId) {
        return jdbcTemplate.queryForList("""
                SELECT user_id FROM memberships WHERE status = 'ACTIVE' AND employee_id = ?
                """, UUID.class, employeeId);
    }
}
