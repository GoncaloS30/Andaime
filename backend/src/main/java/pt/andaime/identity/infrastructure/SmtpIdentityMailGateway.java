package pt.andaime.identity.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import pt.andaime.identity.application.IdentityMailGateway;

@Component
final class SmtpIdentityMailGateway implements IdentityMailGateway {

    private final JavaMailSender mailSender;
    private final String publicUrl;

    SmtpIdentityMailGateway(
            JavaMailSender mailSender,
            @Value("${andaime.public-url:http://localhost:5173}") String publicUrl) {
        this.mailSender = mailSender;
        this.publicUrl = publicUrl;
    }

    @Override
    public void sendVerification(String email, String displayName, String token) {
        var message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Confirme o seu email no Andaime");
        message.setText("Olá " + displayName + ",\n\nConfirme o email em:\n"
                + publicUrl + "/verificar-email?token=" + token);
        mailSender.send(message);
    }

    @Override
    public void sendExistingAccountNotice(String email) {
        var message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Tentativa de registo no Andaime");
        message.setText("Foi tentado um novo registo com este endereço. A sua conta existente não foi alterada.");
        mailSender.send(message);
    }
}
