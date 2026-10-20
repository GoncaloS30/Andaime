package pt.andaime.notifications.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import pt.andaime.notifications.application.NotificationMailGateway;

@Component
final class SmtpNotificationMailGateway implements NotificationMailGateway {

    private final JavaMailSender mailSender;
    private final String publicUrl;

    SmtpNotificationMailGateway(
            JavaMailSender mailSender,
            @Value("${andaime.public-url:http://localhost:5173}") String publicUrl) {
        this.mailSender = mailSender;
        this.publicUrl = publicUrl;
    }

    @Override
    public void send(NotificationMail mail) {
        var text = new StringBuilder()
                .append("Olá ").append(mail.displayName()).append(",\n\n")
                .append(mail.title()).append('\n');
        if (mail.body() != null && !mail.body().isBlank()) {
            text.append(mail.body()).append('\n');
        }
        text.append("\nAbrir no Andaime: ").append(publicUrl).append(mail.link() == null ? "/" : mail.link())
                .append("\n\n--\nRecebe este email porque tem os avisos por email ligados na empresa ")
                .append(mail.organizationName()).append(". Pode desligá-los em «A minha conta».");
        var message = new SimpleMailMessage();
        message.setTo(mail.to());
        message.setSubject(mail.title() + " · " + mail.organizationName());
        message.setText(text.toString());
        mailSender.send(message);
    }
}
