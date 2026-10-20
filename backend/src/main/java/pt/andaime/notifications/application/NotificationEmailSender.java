package pt.andaime.notifications.application;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

import pt.andaime.notifications.application.NotificationMailGateway.NotificationMail;

/**
 * Envia a fila de avisos por email. Cada lote é reclamado atomicamente ({@code SKIP LOCKED}, várias instâncias podem
 * correr ao mesmo tempo); um envio falhado volta à fila com recuo e desiste à 5.ª tentativa. Entrega "pelo menos uma
 * vez": se a instância morrer depois de enviar e antes de fechar, o email pode repetir-se ao fim de 10 minutos.
 */
@Service
public class NotificationEmailSender {

    private static final Logger log = LoggerFactory.getLogger(NotificationEmailSender.class);

    private final JdbcTemplate jdbcTemplate;
    private final NotificationMailGateway gateway;

    NotificationEmailSender(JdbcTemplate jdbcTemplate, NotificationMailGateway gateway) {
        this.jdbcTemplate = jdbcTemplate;
        this.gateway = gateway;
    }

    /** Envia um lote; devolve quantos emails foram reclamados. */
    public int sendPending() {
        var batch = jdbcTemplate.query("SELECT * FROM app.claim_notification_emails(50)", (resultSet, rowNumber) -> new Claimed(
                resultSet.getObject("notification_id", UUID.class),
                new NotificationMail(resultSet.getString("email"), resultSet.getString("display_name"),
                        resultSet.getString("organization_name"), resultSet.getString("title"), resultSet.getString("body"),
                        resultSet.getString("link"))));
        for (var claimed : batch) {
            String error = null;
            try {
                gateway.send(claimed.mail());
            } catch (RuntimeException exception) {
                error = exception.getClass().getSimpleName() + ": " + exception.getMessage();
                log.warn("Aviso {} não seguiu por email: {}", claimed.id(), error);
            }
            jdbcTemplate.queryForList("SELECT app.finish_notification_email(?, ?::text)", claimed.id(), error);
        }
        return batch.size();
    }

    private record Claimed(UUID id, NotificationMail mail) {
    }

    @Component
    @ConditionalOnProperty(name = "andaime.jobs.enabled", havingValue = "true", matchIfMissing = true)
    static class Job {

        private final NotificationEmailSender sender;

        Job(NotificationEmailSender sender) {
            this.sender = sender;
        }

        @Scheduled(fixedDelayString = "${andaime.jobs.notification-email-delay:PT20S}", initialDelayString = "PT20S")
        void run() {
            try {
                sender.sendPending();
            } catch (RuntimeException exception) {
                log.warn("Fila de avisos por email falhou", exception);
            }
        }
    }
}
