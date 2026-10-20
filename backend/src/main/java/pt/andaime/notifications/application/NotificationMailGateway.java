package pt.andaime.notifications.application;

/** Envio de um aviso por email; a implementação SMTP vive em {@code infrastructure}. */
public interface NotificationMailGateway {

    record NotificationMail(String to, String displayName, String organizationName, String title, String body, String link) {
    }

    void send(NotificationMail mail);
}
